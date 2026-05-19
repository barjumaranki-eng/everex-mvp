"use server";

import { Prisma } from "@prisma/client";
import { BankMovementType, BankRowStatus, FiatCurrency, StmtEntityKind, StmtEntryKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import {
  canCreateOperatorManualAdjustment,
  canDeleteOperatorBankPayment,
  canLiquidateOperatorBankGtq,
  canManageOperatorCatalog,
} from "@/lib/authz";
import { deleteStatementEntriesByRefInTx } from "@/lib/delete-statement-entries-by-ref";
import { dayKeyFromDateLocal, parseOperativeDateTimeFromForm } from "@/lib/operative-datetime";
import { normalizeMoneyBackend } from "@/lib/format-money";
import { getOperatorLedgerSummary } from "@/lib/operator-ledger";

export async function createOperator(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canManageOperatorCatalog(user)) return { error: "No autorizado" };
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Nombre requerido" };
  try {
    await prisma.operator.create({ data: { name } });
  } catch {
    return { error: "Ya existe o no se pudo crear" };
  }
  revalidatePath("/operadores");
  return {};
}

export async function addOperatorManualAdjustment(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canCreateOperatorManualAdjustment(user)) return { error: "No autorizado" };
  const operatorId = String(formData.get("operatorId") ?? "").trim();
  if (!operatorId) return { error: "Operador requerido" };
  const raw = normalizeMoneyBackend(String(formData.get("amountGtq") ?? ""));
  if (raw === "" || Number.isNaN(Number(raw))) return { error: "Monto inválido" };
  const mag = new Prisma.Decimal(raw);
  if (mag.lte(0)) return { error: "El monto debe ser mayor a cero" };
  const dir = String(formData.get("direction") ?? "").trim();
  const sign = dir === "credit" ? new Prisma.Decimal(-1) : new Prisma.Decimal(1);
  const amountGtq = mag.mul(sign);
  const label = String(formData.get("label") ?? "").trim();
  if (label.length < 3) return { error: "Motivo obligatorio (mín. 3 caracteres)" };
  const operativeInstant = parseOperativeDateTimeFromForm(formData);
  const dayKey = dayKeyFromDateLocal(operativeInstant);
  await prisma.statementEntry.create({
    data: {
      entityKind: StmtEntityKind.OPERATOR,
      operatorId,
      amountGtq,
      kind: StmtEntryKind.MANUAL_ADJUST,
      label,
      dayKey,
      postedAt: operativeInstant,
      createdAt: operativeInstant,
      createdByUserId: user!.id,
    },
  });
  revalidatePath("/operadores");
  revalidatePath(`/operadores/${operatorId}`);
  return {};
}

function decAmount(s: string): Prisma.Decimal {
  const n = normalizeMoneyBackend(s);
  if (n === "" || Number.isNaN(Number(n))) throw new Error("Monto inválido");
  return new Prisma.Decimal(n);
}

function formatPrismaOrError(e: unknown): string {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    return `${e.code}: ${e.message}`;
  }
  if (e instanceof Prisma.PrismaClientValidationError) {
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

/** Pago GTQ desde banco Everex al operador: movimiento bancario DEBIT + asiento PAGO_EVEREX_A_OPERADOR. */
export async function registerOperatorEverexBankPayment(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canLiquidateOperatorBankGtq(user)) return { error: "No autorizado" };

  const operatorId = String(formData.get("operatorId") ?? "").trim();
  if (!operatorId) return { error: "Operador requerido" };
  const bankAccountId = String(formData.get("bankAccountId") ?? "").trim();
  if (!bankAccountId) return { error: "Seleccione banco origen" };

  let amountGtqPos: Prisma.Decimal;
  try {
    amountGtqPos = decAmount(String(formData.get("amountGtq") ?? ""));
  } catch {
    return { error: "Monto inválido" };
  }
  if (amountGtqPos.lte(0)) return { error: "El monto debe ser mayor a cero" };

  const operativeInstant = parseOperativeDateTimeFromForm(formData);
  const reference = String(formData.get("reference") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const referenceOrNull = reference.length > 0 ? reference : null;

  const op = await prisma.operator.findUnique({ where: { id: operatorId } });
  if (!op) return { error: "Operador no encontrado" };

  const bank = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, active: true },
  });
  if (!bank) return { error: "Cuenta bancaria no encontrada" };
  if (bank.currency !== FiatCurrency.GTQ) {
    return { error: "Solo cuentas en GTQ para este pago" };
  }

  const dayKey = dayKeyFromDateLocal(operativeInstant);
  const stmtLabel = [
    "Pago Everex a operador",
    `Banco: ${bank.label}`,
    reference ? `Ref: ${reference}` : null,
    notes || null,
  ]
    .filter(Boolean)
    .join(" · ");
  const bankDesc = [
    `Pago operador ${op.name}`,
    reference ? `Ref: ${reference}` : null,
    notes ? notes : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const amountStmt = amountGtqPos.mul(-1);

  const bankMovementData = {
    bankAccountId,
    date: operativeInstant,
    createdAt: operativeInstant,
    description: bankDesc,
    amount: amountGtqPos,
    type: BankMovementType.DEBIT,
    currency: FiatCurrency.GTQ,
    reference: referenceOrNull,
    status: BankRowStatus.UNMATCHED,
    createdByUserId: user!.id,
  };

  try {
    await prisma.$transaction(async (tx) => {
      const mov = await tx.bankMovement.create({ data: bankMovementData });
      await tx.statementEntry.create({
        data: {
          entityKind: StmtEntityKind.OPERATOR,
          operatorId,
          amountGtq: amountStmt,
          kind: StmtEntryKind.PAGO_EVEREX_A_OPERADOR,
          label: stmtLabel,
          refType: "BankMovement",
          refId: mov.id,
          dayKey,
          postedAt: operativeInstant,
          createdAt: operativeInstant,
          createdByUserId: user!.id,
        },
      });
    });
  } catch (e) {
    console.error("registerOperatorEverexBankPayment", e);
    return { error: formatPrismaOrError(e) };
  }

  revalidatePath("/dashboard");
  revalidatePath("/operadores");
  revalidatePath(`/operadores/${operatorId}`);
  revalidatePath("/bancos");
  return {};
}

/** Elimina pago banco→operador (movimiento + asiento vinculado). Solo administración. */
export async function deleteOperatorEverexBankPayment(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canDeleteOperatorBankPayment(user)) return { error: "Solo administración puede eliminar pagos a operador." };

  const bankMovementId = String(formData.get("bankMovementId") ?? "").trim();
  const operatorId = String(formData.get("operatorId") ?? "").trim();
  if (!bankMovementId) return { error: "Movimiento inválido" };

  const mov = await prisma.bankMovement.findUnique({
    where: { id: bankMovementId },
    select: { id: true, description: true },
  });
  if (!mov) return { error: "Movimiento no encontrado" };
  if (!mov.description.includes("Pago operador")) {
    return { error: "Este movimiento no es un pago a operador del sistema." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await deleteStatementEntriesByRefInTx(tx, "BankMovement", bankMovementId);
      await tx.bankMovement.delete({ where: { id: bankMovementId } });
    });
  } catch (e) {
    console.error("deleteOperatorEverexBankPayment", e);
    return { error: formatPrismaOrError(e) };
  }

  revalidatePath("/dashboard");
  revalidatePath("/bancos");
  revalidatePath("/operadores");
  if (operatorId) revalidatePath(`/operadores/${operatorId}`);
  return {};
}

export async function renameOperator(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canManageOperatorCatalog(user)) return { error: "No autorizado" };
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return { error: "Datos incompletos" };
  const op = await prisma.operator.findUnique({ where: { id } });
  if (!op) return { error: "Operador no encontrado" };
  try {
    await prisma.operator.update({ where: { id }, data: { name } });
  } catch {
    return { error: "Ese nombre ya existe u otro error al guardar" };
  }
  revalidatePath("/operadores");
  revalidatePath(`/operadores/${id}`);
  revalidatePath("/compras-usdt");
  revalidatePath("/operaciones/nueva");
  revalidatePath("/deudas");
  revalidatePath("/dashboard");
  revalidatePath("/estado-financiero");
  return {};
}

export async function setOperatorActive(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!canManageOperatorCatalog(user)) return;
  const id = String(formData.get("id") ?? "").trim();
  const activeRaw = String(formData.get("active") ?? "").trim();
  if (!id) return;
  const active = activeRaw === "true" || activeRaw === "1";
  const op = await prisma.operator.findUnique({ where: { id } });
  if (!op) return;
  await prisma.operator.update({ where: { id }, data: { active } });
  revalidatePath("/operadores");
  revalidatePath(`/operadores/${id}`);
  revalidatePath("/compras-usdt");
  revalidatePath("/operaciones/nueva");
  revalidatePath("/deudas");
  revalidatePath("/dashboard");
  revalidatePath("/estado-financiero");
}

export async function deleteOperatorIfSafe(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canManageOperatorCatalog(user)) return { error: "No autorizado" };
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Operador requerido" };

  const op = await prisma.operator.findUnique({ where: { id } });
  if (!op) return { error: "Operador no encontrado" };

  const summary = await getOperatorLedgerSummary(id);

  if (!summary.canHardDelete) {
    return {
      error: summary.hasLedger
        ? "Este operador tiene movimientos u operaciones en el sistema. Use “Desactivar” para ocultarlo en formularios nuevos sin borrar el historial."
        : "El saldo en libros no es cero. Revise movimientos o use “Desactivar” en lugar de eliminar.",
    };
  }

  try {
    await prisma.operator.delete({ where: { id } });
  } catch (e) {
    console.error(e);
    return {
      error:
        "No se pudo eliminar (puede haber datos vinculados). Use “Desactivar” y conserve el historial.",
    };
  }

  revalidatePath("/operadores");
  revalidatePath("/compras-usdt");
  revalidatePath("/operaciones/nueva");
  revalidatePath("/deudas");
  revalidatePath("/dashboard");
  revalidatePath("/estado-financiero");
  return {};
}
