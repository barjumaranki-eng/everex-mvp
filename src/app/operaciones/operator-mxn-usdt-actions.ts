"use server";

import {
  Prisma,
  StmtEntityKind,
  StmtEntryKind,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canCreateOtcOperation, canDeleteOtcOperation, canRunOperations } from "@/lib/authz";
import { dayKeyFromDateLocal, parseOperativeDateTimeFromForm } from "@/lib/operative-datetime";
import { normalizeMoneyBackend } from "@/lib/format-money";
import { computeInventoryFromDb } from "@/lib/inventory";
import { OPERATOR_MXN_USDT_SETTLEMENT_REF_TYPE } from "@/lib/operator-mxn-usdt-constants";
import { buildOperatorMxnUsdtPayoutStatementLabel } from "@/lib/operator-mxn-usdt-statement-label";
import { syncOperatorMxnUsdtSettlementsToOperatorLedger } from "@/lib/operator-ledger";
import { createStatementEntryCompat } from "@/lib/statement-entry-create-compat";
import { writeAppAuditLogInTx } from "@/lib/app-audit";
import { deleteStatementEntriesByRefInTx } from "@/lib/delete-statement-entries-by-ref";

function dec(s: string): Prisma.Decimal {
  const n = normalizeMoneyBackend(s);
  if (n === "" || Number.isNaN(Number(n))) throw new Error("Monto inválido");
  return new Prisma.Decimal(n);
}

function optDec(s: string | null): Prisma.Decimal | undefined {
  const n = normalizeMoneyBackend(String(s ?? ""));
  if (n === "") return undefined;
  if (Number.isNaN(Number(n))) throw new Error("Monto inválido");
  return new Prisma.Decimal(n);
}

export async function createOperatorMxnUsdtSettlement(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canCreateOtcOperation(user)) return { error: "No autorizado" };

  const operatorId = String(formData.get("operatorId") ?? "").trim();
  if (!operatorId) return { error: "Seleccione operador" };

  const providerId = String(formData.get("providerId") ?? "").trim() || undefined;

  let mxnReceived: Prisma.Decimal;
  let xeReference: Prisma.Decimal;
  let usdtPaid: Prisma.Decimal;
  let gtqRateOptional: Prisma.Decimal | undefined;
  try {
    mxnReceived = dec(String(formData.get("mxnReceived") ?? ""));
    xeReference = dec(String(formData.get("xeReference") ?? ""));
    usdtPaid = dec(String(formData.get("usdtPaid") ?? ""));
    gtqRateOptional = optDec(String(formData.get("gtqRateOptional") ?? ""));
  } catch {
    return { error: "Montos o tasas inválidos" };
  }

  if (xeReference.lte(0)) return { error: "XE referencia debe ser mayor a cero" };
  if (mxnReceived.lte(0)) return { error: "MXN recibidos deben ser mayores a cero" };
  if (usdtPaid.lte(0)) return { error: "USDT pagados deben ser mayores a cero" };

  const referenceUsdt = mxnReceived.div(xeReference);
  const diffUsdt = referenceUsdt.sub(usdtPaid);

  const inv = await computeInventoryFromDb();
  const paid = Number(usdtPaid.toString());
  if (inv.usdt < paid - 1e-9) {
    return { error: `Inventario USDT insuficiente (disponible ${inv.usdt.toFixed(2)} USDT).` };
  }

  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  const operativeInstant = parseOperativeDateTimeFromForm(formData);
  const dayKey = dayKeyFromDateLocal(operativeInstant);

  const label = buildOperatorMxnUsdtPayoutStatementLabel({
    mxnReceived,
    xeReference,
    referenceUsdt,
    usdtPaid,
    diffUsdt,
    gtqRateOptional: gtqRateOptional ?? null,
    notes,
  });

  let id = "";
  try {
    await prisma.$transaction(async (tx) => {
      const row = await tx.operatorMxnUsdtSettlement.create({
        data: {
          operatorId,
          providerId: providerId ?? null,
          mxnReceived,
          xeReference,
          usdtPaid,
          gtqRateOptional: gtqRateOptional ?? null,
          referenceUsdt,
          diffUsdt,
          notes,
          dayKey,
          createdAt: operativeInstant,
          createdByUserId: user!.id,
        },
      });
      id = row.id;
      const ok = await createStatementEntryCompat(
        tx,
        {
          entityKind: StmtEntityKind.OPERATOR,
          operatorId,
          clientId: null,
          providerId: null,
          amountGtq: new Prisma.Decimal(0),
          kind: StmtEntryKind.OPERATOR_MXN_USDT_PAYOUT,
          label,
          refType: OPERATOR_MXN_USDT_SETTLEMENT_REF_TYPE,
          refId: row.id,
          dayKey,
          createdByUserId: user!.id,
        },
        operativeInstant,
      );
      if (!ok) {
        throw new Error("No se pudo crear el asiento de libro del operador (OPERATOR_MXN_USDT_PAYOUT).");
      }
    });
  } catch (e) {
    console.error(e);
    return { error: e instanceof Error ? e.message : "No se pudo guardar" };
  }

  revalidatePath("/operaciones", "layout");
  revalidatePath("/operaciones", "page");
  revalidatePath("/dashboard", "page");
  revalidatePath("/operadores", "page");
  revalidatePath(`/operadores/${operatorId}`, "page");
  revalidatePath(`/operaciones/operator-mxn-usdt/${id}`, "page");
  redirect(`/operaciones/operator-mxn-usdt/${id}`);
}

/** Idempotente: crea asientos OPERATOR_MXN_USDT_PAYOUT faltantes por liquidación (misma forma que el alta normal). */
export async function syncOperatorMxnUsdtSettlementsToOperatorLedgerAction(): Promise<void> {
  const user = await getSessionUser();
  if (!canRunOperations(user)) {
    redirect("/operaciones?omSyncNoAuth=1");
  }
  const r = await syncOperatorMxnUsdtSettlementsToOperatorLedger();
  revalidatePath("/operaciones", "layout");
  revalidatePath("/dashboard", "page");
  revalidatePath("/operadores", "page");
  const qs = new URLSearchParams();
  qs.set("omSyncExamined", String(r.examined));
  qs.set("omSyncCreated", String(r.created));
  qs.set("omSyncSkipped", String(r.skipped));
  if (r.errors.length > 0) {
    qs.set("omSyncErr", r.errors.join(" · ").slice(0, 900));
  }
  redirect(`/operaciones?${qs.toString()}`);
}

function omSettlementAuditPayload(row: {
  id: string;
  ref: string;
  operatorId: string;
  providerId: string | null;
  mxnReceived: Prisma.Decimal;
  xeReference: Prisma.Decimal;
  usdtPaid: Prisma.Decimal;
  referenceUsdt: Prisma.Decimal;
  diffUsdt: Prisma.Decimal;
  dayKey: string;
  createdAt: Date;
  notes?: string | null;
}) {
  return {
    id: row.id,
    ref: row.ref,
    operatorId: row.operatorId,
    providerId: row.providerId,
    mxnReceived: row.mxnReceived.toString(),
    xeReference: row.xeReference.toString(),
    usdtPaid: row.usdtPaid.toString(),
    referenceUsdt: row.referenceUsdt.toString(),
    diffUsdt: row.diffUsdt.toString(),
    dayKey: row.dayKey,
    createdAt: row.createdAt.toISOString(),
    notes: row.notes ?? null,
  };
}

export async function deleteOperatorMxnUsdtSettlement(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canDeleteOtcOperation(user)) return { error: "Solo administración puede eliminar esta liquidación." };

  const id = String(formData.get("settlementId") ?? "").trim();
  if (!id) return { error: "Liquidación inválida" };

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Indique el motivo de la eliminación." };

  const prev = await prisma.operatorMxnUsdtSettlement.findUnique({ where: { id } });
  if (!prev) return { error: "Liquidación no encontrada" };

  const before = omSettlementAuditPayload(prev);

  try {
    await prisma.$transaction(async (tx) => {
      await deleteStatementEntriesByRefInTx(tx, OPERATOR_MXN_USDT_SETTLEMENT_REF_TYPE, id);
      await tx.operatorMxnUsdtSettlement.delete({ where: { id } });
      await writeAppAuditLogInTx(tx, {
        userId: user!.id,
        action: "OTC_OPERATION_DELETE",
        entityType: "OperatorMxnUsdtSettlement",
        entityId: id,
        payloadBefore: before,
        payloadAfter: { deleted: true },
        reason,
      });
    });
  } catch (e) {
    console.error(e);
    return { error: e instanceof Error ? e.message : "No se pudo eliminar" };
  }

  revalidatePath("/operaciones", "layout");
  revalidatePath("/dashboard", "page");
  revalidatePath("/operadores", "page");
  revalidatePath(`/operadores/${prev.operatorId}`, "page");
  revalidatePath("/proveedores", "page");
  revalidatePath("/bancos", "page");
  revalidatePath("/clientes", "page");
  redirect("/operaciones");
}
