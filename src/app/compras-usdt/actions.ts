"use server";

import {
  Prisma,
  PurchaseCounterparty,
  StmtEntityKind,
  StmtEntryKind,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canCreateUsdtPurchase, canDeleteUsdtPurchase, canEditUsdtPurchase } from "@/lib/authz";
import { writeAppAuditLogInTx } from "@/lib/app-audit";
import { normalizeMoneyBackend } from "@/lib/format-money";
import { dayKeyFromDateLocal, parseOperativeDateTimeFromForm } from "@/lib/operative-datetime";
import { createStatementEntryCompat } from "@/lib/statement-entry-create-compat";

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

export async function createUsdtPurchase(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canCreateUsdtPurchase(user)) return { error: "No autorizado" };

  const counterparty = String(formData.get("counterparty") ?? "") as PurchaseCounterparty;
  if (!Object.values(PurchaseCounterparty).includes(counterparty)) {
    return { error: "Tipo de contraparte inválido" };
  }
  if (counterparty === PurchaseCounterparty.CLIENT) {
    return {
      error:
        "Contraparte Cliente no aplica en Compras USDT. Use Nueva operación → Cliente MXN Spread para cliente con MXN.",
    };
  }
  if (counterparty !== PurchaseCounterparty.OPERATOR && counterparty !== PurchaseCounterparty.PROVIDER_MX) {
    return { error: "Seleccione Operador o Proveedor MX." };
  }

  const operatorId = String(formData.get("operatorId") ?? "").trim() || undefined;
  const providerId = String(formData.get("providerId") ?? "").trim() || undefined;

  if (counterparty === "OPERATOR" && !operatorId) return { error: "Seleccione operador" };
  if (counterparty === "PROVIDER_MX" && !providerId) return { error: "Seleccione proveedor MX" };

  const persistedOperatorId =
    counterparty === "OPERATOR" ? operatorId! : operatorId ? operatorId : null;
  const persistedProviderId = counterparty === "PROVIDER_MX" ? providerId! : null;

  let gtqTotal: Prisma.Decimal;
  let usdtAmount: Prisma.Decimal;
  let amountMxn: Prisma.Decimal | undefined;
  let rateXe: Prisma.Decimal | undefined;
  let rateMxnToGtq: Prisma.Decimal | undefined;
  try {
    gtqTotal = dec(String(formData.get("gtqTotal") ?? ""));
    usdtAmount = dec(String(formData.get("usdtAmount") ?? ""));
    amountMxn = optDec(String(formData.get("amountMxn") ?? ""));
    rateXe = optDec(String(formData.get("rateXe") ?? ""));
    rateMxnToGtq = optDec(String(formData.get("rateMxnToGtq") ?? ""));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Montos inválidos" };
  }

  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  const fechaOperativa = parseOperativeDateTimeFromForm(formData);
  const dayKey = dayKeyFromDateLocal(fechaOperativa);

  let purchaseId: string;
  try {
    const p = await prisma.usdtPurchase.create({
      data: {
        counterparty,
        operatorId: persistedOperatorId,
        clientId: null,
        providerId: persistedProviderId,
        amountMxn: amountMxn ?? null,
        gtqTotal,
        usdtAmount,
        rateXe: rateXe ?? null,
        rateMxnToGtq: rateMxnToGtq ?? null,
        notes,
        dayKey,
        createdAt: fechaOperativa,
        createdByUserId: user!.id,
      },
    });
    purchaseId = p.id;
  } catch (e) {
    console.error(e);
    return { error: e instanceof Error ? e.message : "No se pudo guardar la compra USDT" };
  }

  const stmtBase: Prisma.StatementEntryUncheckedCreateInput =
    counterparty === "OPERATOR"
      ? {
          entityKind: StmtEntityKind.OPERATOR,
          operatorId: operatorId!,
          clientId: null,
          providerId: null,
          amountGtq: gtqTotal,
          kind: StmtEntryKind.USDT_PURCHASE,
          label: "Compra USDT",
          refType: "UsdtPurchase",
          refId: purchaseId,
          dayKey,
          createdByUserId: user!.id,
        }
      : {
          entityKind: StmtEntityKind.PROVIDER_MX,
          operatorId: null,
          clientId: null,
          providerId: providerId!,
          amountGtq: gtqTotal,
          kind: StmtEntryKind.USDT_PURCHASE,
          label: "Compra USDT proveedor MX",
          refType: "UsdtPurchase",
          refId: purchaseId,
          dayKey,
          createdByUserId: user!.id,
        };

  try {
    await prisma.statementEntry.create({
      data: { ...stmtBase, postedAt: fechaOperativa },
    });
  } catch (e) {
    console.error("[compras-usdt] StatementEntry con postedAt no aplicó:", e);
    try {
      await prisma.statementEntry.create({ data: stmtBase });
    } catch (e2) {
      console.error("[compras-usdt] StatementEntry mínimo falló; la compra USDT ya está guardada:", e2);
    }
  }

  revalidatePath("/compras-usdt");
  revalidatePath("/dashboard");
  revalidatePath("/estado-financiero");
  revalidatePath("/proveedores");
  revalidatePath("/proveedor-mx");
  revalidatePath("/operadores");
  if (counterparty === "PROVIDER_MX" && providerId) revalidatePath(`/proveedores/${providerId}`);
  if (persistedOperatorId) revalidatePath(`/operadores/${persistedOperatorId}`);
  redirect("/compras-usdt");
}

function decStr(x: unknown): string {
  if (x == null) return "";
  if (typeof x === "object" && x !== null && "toString" in x) return String((x as { toString: () => string }).toString());
  return String(x);
}

function purchaseAuditPayload(p: {
  id: string;
  counterparty: PurchaseCounterparty;
  operatorId: string | null;
  clientId: string | null;
  providerId: string | null;
  gtqTotal: Prisma.Decimal;
  usdtAmount: Prisma.Decimal;
  dayKey: string;
  createdAt: Date;
  notes?: string | null;
}) {
  return {
    id: p.id,
    counterparty: p.counterparty,
    operatorId: p.operatorId,
    clientId: p.clientId,
    providerId: p.providerId,
    gtqTotal: p.gtqTotal.toString(),
    usdtAmount: p.usdtAmount.toString(),
    dayKey: p.dayKey,
    createdAt: p.createdAt.toISOString(),
    notes: p.notes ?? null,
  };
}

async function appendPurchaseAudit(
  tx: Prisma.TransactionClient,
  purchaseId: string,
  userId: string,
  field: string,
  oldVal: unknown,
  newVal: unknown,
) {
  const o = decStr(oldVal);
  const n = decStr(newVal);
  if (o === n) return;
  await tx.usdtPurchaseEditLog.create({
    data: { purchaseId, userId, field, oldValue: o || null, newValue: n || null },
  });
}

export async function updateUsdtPurchase(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canEditUsdtPurchase(user)) return { error: "No autorizado" };

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Compra inválida" };

  const prev = await prisma.usdtPurchase.findUnique({ where: { id } });
  if (!prev) return { error: "Compra no encontrada" };

  const counterparty = String(formData.get("counterparty") ?? "") as PurchaseCounterparty;
  if (!Object.values(PurchaseCounterparty).includes(counterparty)) {
    return { error: "Tipo de contraparte inválido" };
  }
  if (counterparty === PurchaseCounterparty.CLIENT) {
    return {
      error:
        "Contraparte Cliente no aplica. Use Nueva operación → Cliente MXN Spread, o cambie a Operador / Proveedor MX.",
    };
  }
  if (counterparty !== PurchaseCounterparty.OPERATOR && counterparty !== PurchaseCounterparty.PROVIDER_MX) {
    return { error: "Seleccione Operador o Proveedor MX." };
  }

  const operatorId = String(formData.get("operatorId") ?? "").trim() || undefined;
  const providerId = String(formData.get("providerId") ?? "").trim() || undefined;

  if (counterparty === "OPERATOR" && !operatorId) return { error: "Seleccione operador" };
  if (counterparty === "PROVIDER_MX" && !providerId) return { error: "Seleccione proveedor MX" };

  let amountMxn: Prisma.Decimal | undefined;
  let rateXe: Prisma.Decimal | undefined;
  let rateMxnToGtq: Prisma.Decimal | undefined;
  try {
    amountMxn = optDec(String(formData.get("amountMxn") ?? ""));
    rateXe = optDec(String(formData.get("rateXe") ?? ""));
    rateMxnToGtq = optDec(String(formData.get("rateMxnToGtq") ?? ""));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Montos inválidos" };
  }

  const recalcFromRates = String(formData.get("recalcFromRates") ?? "") === "on";

  let gtqTotal: Prisma.Decimal;
  let usdtAmount: Prisma.Decimal;
  try {
    if (recalcFromRates) {
      if (!amountMxn || !rateXe || !rateMxnToGtq) {
        return {
          error: "Para recalcular complete MXN, XE (MXN/USDT) y MXN→GTQ (GTQ por MXN).",
        };
      }
      if (rateXe.lte(0)) return { error: "XE debe ser mayor que cero" };
      usdtAmount = amountMxn.div(rateXe);
      gtqTotal = amountMxn.mul(rateMxnToGtq);
    } else {
      gtqTotal = dec(String(formData.get("gtqTotal") ?? ""));
      usdtAmount = dec(String(formData.get("usdtAmount") ?? ""));
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Montos inválidos" };
  }

  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  const fechaOperativa = parseOperativeDateTimeFromForm(formData);
  const newDayKey = dayKeyFromDateLocal(fechaOperativa);

  const nextOpId =
    counterparty === "OPERATOR" ? operatorId ?? null : operatorId?.trim() ? operatorId.trim() : null;
  const nextClId = null;
  const nextPrId = counterparty === "PROVIDER_MX" ? providerId ?? null : null;

  let stmtEntity: {
    entityKind: StmtEntityKind;
    operatorId: string | null;
    clientId: string | null;
    providerId: string | null;
    label: string;
  };
  if (counterparty === "OPERATOR") {
    stmtEntity = {
      entityKind: StmtEntityKind.OPERATOR,
      operatorId: nextOpId,
      clientId: null,
      providerId: null,
      label: "Compra USDT",
    };
  } else {
    stmtEntity = {
      entityKind: StmtEntityKind.PROVIDER_MX,
      operatorId: null,
      clientId: null,
      providerId: nextPrId,
      label: "Compra USDT proveedor MX",
    };
  }

  const stmtPayload: Omit<Prisma.StatementEntryUncheckedCreateInput, "postedAt" | "createdAt"> = {
    entityKind: stmtEntity.entityKind,
    operatorId: stmtEntity.operatorId,
    clientId: stmtEntity.clientId,
    providerId: stmtEntity.providerId,
    amountGtq: gtqTotal,
    kind: StmtEntryKind.USDT_PURCHASE,
    label: stmtEntity.label,
    refType: "UsdtPurchase",
    refId: id,
    dayKey: newDayKey,
    createdByUserId: user!.id,
  };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.statementEntry.deleteMany({
        where: {
          refType: "UsdtPurchase",
          refId: id,
          cuadradoraAdjustment: null,
        },
      });

      const orphanStmts = await tx.statementEntry.findMany({
        where: { refType: "UsdtPurchase", refId: id },
        select: { id: true },
      });

      await tx.usdtPurchase.update({
        where: { id },
        data: {
          counterparty,
          operatorId: nextOpId,
          clientId: nextClId,
          providerId: nextPrId,
          amountMxn: amountMxn ?? null,
          gtqTotal,
          usdtAmount,
          rateXe: rateXe ?? null,
          rateMxnToGtq: rateMxnToGtq ?? null,
          notes: notes ?? null,
          dayKey: newDayKey,
          createdAt: fechaOperativa,
        },
      });

      if (orphanStmts.length === 0) {
        const ok = await createStatementEntryCompat(tx, stmtPayload, fechaOperativa);
        if (!ok) {
          throw new Error("No se pudo recrear el asiento de libro (StatementEntry).");
        }
      } else if (orphanStmts.length === 1) {
        await tx.statementEntry.update({
          where: { id: orphanStmts[0].id },
          data: {
            entityKind: stmtPayload.entityKind,
            operatorId: stmtPayload.operatorId,
            clientId: stmtPayload.clientId,
            providerId: stmtPayload.providerId,
            amountGtq: stmtPayload.amountGtq,
            kind: stmtPayload.kind,
            label: stmtPayload.label,
            dayKey: stmtPayload.dayKey,
            postedAt: fechaOperativa,
          },
        });
      } else {
        throw new Error("Varios asientos de libro ligados a esta compra; requiere revisión manual.");
      }

      await appendPurchaseAudit(tx, id, user!.id, "counterparty", prev.counterparty, counterparty);
      await appendPurchaseAudit(tx, id, user!.id, "operatorId", prev.operatorId, nextOpId);
      await appendPurchaseAudit(tx, id, user!.id, "clientId", prev.clientId, nextClId);
      await appendPurchaseAudit(tx, id, user!.id, "providerId", prev.providerId, nextPrId);
      await appendPurchaseAudit(tx, id, user!.id, "amountMxn", prev.amountMxn, amountMxn ?? null);
      await appendPurchaseAudit(tx, id, user!.id, "gtqTotal", prev.gtqTotal, gtqTotal);
      await appendPurchaseAudit(tx, id, user!.id, "usdtAmount", prev.usdtAmount, usdtAmount);
      await appendPurchaseAudit(tx, id, user!.id, "rateXe", prev.rateXe, rateXe ?? null);
      await appendPurchaseAudit(tx, id, user!.id, "rateMxnToGtq", prev.rateMxnToGtq, rateMxnToGtq ?? null);
      await appendPurchaseAudit(tx, id, user!.id, "notes", prev.notes, notes ?? null);
      await appendPurchaseAudit(tx, id, user!.id, "dayKey", prev.dayKey, newDayKey);
      await appendPurchaseAudit(tx, id, user!.id, "createdAt", prev.createdAt, fechaOperativa);
      if (recalcFromRates) {
        await appendPurchaseAudit(tx, id, user!.id, "recalcFromRates", "off", "on");
      }

      const updated = await tx.usdtPurchase.findUniqueOrThrow({ where: { id } });
      await writeAppAuditLogInTx(tx, {
        userId: user!.id,
        action: "USDT_PURCHASE_UPDATE",
        entityType: "UsdtPurchase",
        entityId: id,
        payloadBefore: purchaseAuditPayload(prev),
        payloadAfter: purchaseAuditPayload(updated),
        reason: null,
      });
    });
  } catch (e) {
    console.error(e);
    return { error: e instanceof Error ? e.message : "No se pudo guardar" };
  }

  revalidatePath("/compras-usdt");
  revalidatePath(`/compras-usdt/${id}`);
  revalidatePath(`/compras-usdt/${id}/edit`);
  revalidatePath("/dashboard");
  revalidatePath("/estado-financiero");
  revalidatePath("/proveedores");
  revalidatePath("/proveedor-mx");
  revalidatePath("/operadores");
  revalidatePath("/clientes");
  if (prev.operatorId) revalidatePath(`/operadores/${prev.operatorId}`);
  if (nextOpId && nextOpId !== prev.operatorId) revalidatePath(`/operadores/${nextOpId}`);
  if (prev.providerId) revalidatePath(`/proveedores/${prev.providerId}`);
  if (nextPrId && nextPrId !== prev.providerId) revalidatePath(`/proveedores/${nextPrId}`);
  redirect(`/compras-usdt/${id}`);
}

export async function deleteUsdtPurchase(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canDeleteUsdtPurchase(user)) return { error: "Solo administración puede eliminar compras USDT." };

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Compra inválida" };

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Indique el motivo de la eliminación." };

  const prev = await prisma.usdtPurchase.findUnique({ where: { id } });
  if (!prev) return { error: "Compra no encontrada" };

  const before = purchaseAuditPayload(prev);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.statementEntry.deleteMany({
        where: {
          refType: "UsdtPurchase",
          refId: id,
          cuadradoraAdjustment: null,
        },
      });
      const remaining = await tx.statementEntry.count({ where: { refType: "UsdtPurchase", refId: id } });
      if (remaining > 0) {
        throw new Error(
          "Quedan asientos de libro vinculados (p. ej. cuadradora). Elimine o desvincule manualmente antes de borrar la compra.",
        );
      }
      await tx.usdtPurchase.delete({ where: { id } });
      await writeAppAuditLogInTx(tx, {
        userId: user!.id,
        action: "USDT_PURCHASE_DELETE",
        entityType: "UsdtPurchase",
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

  revalidatePath("/compras-usdt");
  revalidatePath("/dashboard");
  revalidatePath("/estado-financiero");
  revalidatePath("/proveedores");
  revalidatePath("/proveedor-mx");
  revalidatePath("/operadores");
  revalidatePath("/clientes");
  if (prev.operatorId) revalidatePath(`/operadores/${prev.operatorId}`);
  if (prev.providerId) revalidatePath(`/proveedores/${prev.providerId}`);
  redirect("/compras-usdt");
}
