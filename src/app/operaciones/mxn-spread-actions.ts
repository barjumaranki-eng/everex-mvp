"use server";

import { Prisma, StmtEntityKind, StmtEntryKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canCreateOtcOperation, canDeleteOtcOperation } from "@/lib/authz";
import { dayKeyFromDateLocal, parseOperativeDateTimeFromForm } from "@/lib/operative-datetime";
import { normalizeMoneyBackend } from "@/lib/format-money";
import { computeInventoryFromDb } from "@/lib/inventory";
import { OTC_MXN_SPREAD_REF_TYPE } from "@/lib/operator-mxn-usdt-constants";
import { createStatementEntryCompat } from "@/lib/statement-entry-create-compat";
import { writeAppAuditLogInTx } from "@/lib/app-audit";
import { deleteStatementEntriesByRefInTx } from "@/lib/delete-statement-entries-by-ref";

function dec(s: string): Prisma.Decimal {
  const n = normalizeMoneyBackend(s);
  if (n === "" || Number.isNaN(Number(n))) throw new Error("Monto inválido");
  return new Prisma.Decimal(n);
}

export async function createMxnSpreadOperation(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canCreateOtcOperation(user)) return { error: "No autorizado" };

  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId) return { error: "Cliente requerido" };

  const providerId = String(formData.get("providerId") ?? "").trim();
  if (!providerId) return { error: "Proveedor MX requerido" };

  let mxnReceived: Prisma.Decimal;
  let xeProvider: Prisma.Decimal;
  let clientRate: Prisma.Decimal;
  try {
    mxnReceived = dec(String(formData.get("mxnReceived") ?? ""));
    xeProvider = dec(String(formData.get("xeProvider") ?? ""));
    clientRate = dec(String(formData.get("clientRate") ?? ""));
  } catch {
    return { error: "Montos o tasas inválidos" };
  }

  if (Number(xeProvider.toString()) <= 0 || Number(clientRate.toString()) <= 0) {
    return { error: "XE proveedor y tasa cliente deben ser mayores a cero" };
  }
  if (Number(mxnReceived.toString()) <= 0) {
    return { error: "MXN recibido debe ser mayor a cero" };
  }

  const usdtFromProvider = mxnReceived.div(xeProvider);
  const usdtToClient = mxnReceived.div(clientRate);
  const profitUsdt = usdtFromProvider.sub(usdtToClient);

  const inv = await computeInventoryFromDb();
  const fromP = Number(usdtFromProvider.toString());
  const toC = Number(usdtToClient.toString());
  if (inv.usdt + fromP < toC - 1e-9) {
    return {
      error: `Inventario USDT insuficiente para la entrega (disponible ${inv.usdt.toFixed(2)} + ${fromP.toFixed(2)} USDT del proveedor).`,
    };
  }

  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  const fechaOperativa = parseOperativeDateTimeFromForm(formData);
  const dayKey = dayKeyFromDateLocal(fechaOperativa);

  let row: { id: string; ref: string };
  try {
    row = await prisma.otcMxnSpread.create({
      data: {
        clientId,
        providerId,
        mxnReceived,
        xeProvider,
        clientRate,
        usdtFromProvider,
        usdtToClient,
        profitUsdt,
        notes,
        dayKey,
        createdAt: fechaOperativa,
        createdByUserId: user!.id,
      },
      select: { id: true, ref: true },
    });
  } catch (e) {
    console.error(e);
    return { error: e instanceof Error ? e.message : "No se pudo guardar la operación" };
  }

  const provLabel = [
    "Cliente MXN spread — proveedor MX",
    `MXN ${mxnReceived.toFixed(2)} · USDT generado ${usdtFromProvider.toFixed(4)} · ref ${row.ref}`,
    notes ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

  const stmtOk = await createStatementEntryCompat(
    prisma,
    {
      entityKind: StmtEntityKind.PROVIDER_MX,
      operatorId: null,
      clientId: null,
      providerId,
      amountGtq: new Prisma.Decimal(0),
      kind: StmtEntryKind.MANUAL_ADJUST,
      label: provLabel,
      refType: OTC_MXN_SPREAD_REF_TYPE,
      refId: row.id,
      dayKey,
      createdByUserId: user!.id,
    },
    fechaOperativa,
  );

  revalidatePath("/operaciones");
  revalidatePath("/dashboard");
  revalidatePath("/proveedores");
  redirect(`/operaciones/mxn-spread/${row.id}${stmtOk ? "" : "?ledgerWarn=1"}`);
}

function mxnSpreadAuditPayload(row: {
  id: string;
  ref: string;
  clientId: string;
  providerId: string;
  mxnReceived: Prisma.Decimal;
  xeProvider: Prisma.Decimal;
  clientRate: Prisma.Decimal;
  usdtFromProvider: Prisma.Decimal;
  usdtToClient: Prisma.Decimal;
  profitUsdt: Prisma.Decimal;
  dayKey: string;
  createdAt: Date;
  notes?: string | null;
}) {
  return {
    id: row.id,
    ref: row.ref,
    clientId: row.clientId,
    providerId: row.providerId,
    mxnReceived: row.mxnReceived.toString(),
    xeProvider: row.xeProvider.toString(),
    clientRate: row.clientRate.toString(),
    usdtFromProvider: row.usdtFromProvider.toString(),
    usdtToClient: row.usdtToClient.toString(),
    profitUsdt: row.profitUsdt.toString(),
    dayKey: row.dayKey,
    createdAt: row.createdAt.toISOString(),
    notes: row.notes ?? null,
  };
}

export async function deleteOtcMxnSpread(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canDeleteOtcOperation(user)) return { error: "Solo administración puede eliminar esta operación." };

  const id = String(formData.get("spreadId") ?? "").trim();
  if (!id) return { error: "Operación inválida" };

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Indique el motivo de la eliminación." };

  const prev = await prisma.otcMxnSpread.findUnique({ where: { id } });
  if (!prev) return { error: "Operación no encontrada" };

  const before = mxnSpreadAuditPayload(prev);

  try {
    await prisma.$transaction(async (tx) => {
      await deleteStatementEntriesByRefInTx(tx, OTC_MXN_SPREAD_REF_TYPE, id);
      await tx.otcMxnSpread.delete({ where: { id } });
      await writeAppAuditLogInTx(tx, {
        userId: user!.id,
        action: "OTC_OPERATION_DELETE",
        entityType: "OtcMxnSpread",
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

  revalidatePath("/operaciones");
  revalidatePath("/dashboard");
  revalidatePath("/proveedores");
  revalidatePath("/clientes");
  revalidatePath("/bancos");
  redirect("/operaciones");
}
