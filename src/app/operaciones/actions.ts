"use server";

import { EverexCreditorType, FiatCurrency, Prisma, OtcSide } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import {
  canCreateOtcOperation,
  canDeleteOtcOperation,
  canEditOtcOperation,
} from "@/lib/authz";
import { writeAppAuditLogInTx } from "@/lib/app-audit";
import { dayKeyFromDateLocal, parseOperativeDateTimeFromForm } from "@/lib/operative-datetime";
import { normalizeMoneyBackend } from "@/lib/format-money";
import { computeInventoryFromDb } from "@/lib/inventory";
import { gtqToUsdEstimate } from "@/lib/fx";
import { applyOtcAllocationLedgerInTx, revertOtcOperationLedgerInTx } from "@/lib/otc-allocation-ledger";
import {
  allocationsMatchTotalFiat,
  parseOtcAllocationsFromFormData,
  sumAllocationsGtqEquivalent,
  sumOperatorUsdtPayoutTotal,
} from "@/lib/otc-allocations-parse";
import { CLIENT_OTC_ADVANCE_REASON_SUBSTR, clientAdvancePayableNotesMarker } from "@/lib/everex-payable-client-advance";
import { buildClientAdvancePayableCreditor } from "@/lib/payable-creditor";

function dec(s: string): Prisma.Decimal {
  const n = normalizeMoneyBackend(s);
  if (n === "" || Number.isNaN(Number(n))) throw new Error("Monto inválido");
  return new Prisma.Decimal(n);
}

function formatGtqDiffMessage(totalFiat: Prisma.Decimal, allocsSum: Prisma.Decimal): string {
  const diff = allocsSum.sub(totalFiat);
  const abs = diff.abs();
  const n = Number(abs.toString());
  const q = n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (diff.abs().lte(new Prisma.Decimal("0.01"))) return "";
  if (diff.lt(0)) return `Faltan Q${q} para cuadrar con el total GTQ de la operación.`;
  return `Sobran Q${q} respecto al total GTQ de la operación.`;
}

function usdtConsumedByBuyOp(
  usdtAmount: Prisma.Decimal,
  allocs: { destination: string; currency: string; amount: Prisma.Decimal }[],
): number {
  let extra = 0;
  for (const a of allocs) {
    if (a.destination === "OPERATOR" && a.currency === "USDT") {
      extra += Number(a.amount.toString());
    }
  }
  return Number(usdtAmount.toString()) + extra;
}

function otcAuditJson(op: {
  id: string;
  ref: string;
  clientId: string;
  side: OtcSide;
  usdtAmount: Prisma.Decimal;
  rateFiatPerUsdt: Prisma.Decimal;
  totalFiat: Prisma.Decimal;
  fiatCurrency: FiatCurrency;
  pnlBasisGtq: Prisma.Decimal;
  profitGtq: Prisma.Decimal | null;
  profitUsd: Prisma.Decimal | null;
  notes: string | null;
  dayKey: string;
  createdAt: Date;
}) {
  return {
    id: op.id,
    ref: op.ref,
    clientId: op.clientId,
    side: op.side,
    usdtAmount: op.usdtAmount.toString(),
    rateFiatPerUsdt: op.rateFiatPerUsdt.toString(),
    totalFiat: op.totalFiat.toString(),
    fiatCurrency: op.fiatCurrency,
    pnlBasisGtq: op.pnlBasisGtq.toString(),
    profitGtq: op.profitGtq?.toString() ?? null,
    profitUsd: op.profitUsd?.toString() ?? null,
    notes: op.notes,
    dayKey: op.dayKey,
    createdAt: op.createdAt.toISOString(),
  };
}

export async function createOtcOperation(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canCreateOtcOperation(user)) return { error: "No autorizado" };

  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId) return { error: "Cliente requerido" };

  const side = String(formData.get("side") ?? "") as OtcSide;
  if (!Object.values(OtcSide).includes(side)) return { error: "Tipo de operación inválido" };

  const fiatCurrency = FiatCurrency.GTQ;

  let allocs;
  try {
    allocs = parseOtcAllocationsFromFormData(formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Repartos inválidos" };
  }

  if (side === OtcSide.CLIENT_SELLS_USDT && allocs.length > 0) {
    return { error: "La distribución de fondos solo aplica a cliente compra USDT GTQ." };
  }

  const usdtAmount = dec(String(formData.get("usdtAmount") ?? ""));
  const rateFiatPerUsdt = dec(String(formData.get("rateFiatPerUsdt") ?? ""));
  /** GTQ aplicado hoy al tramo USDT vendido (solo para utilidad / COGS). */
  const pnlBasisGtq = usdtAmount.mul(rateFiatPerUsdt);

  let totalFiat: Prisma.Decimal;
  if (side === OtcSide.CLIENT_BUYS_USDT) {
    const gtqRecibidoRaw =
      String(formData.get("gtqRecibidoTotal") ?? "").trim() || String(formData.get("totalFiat") ?? "").trim();
    if (!gtqRecibidoRaw) {
      return {
        error:
          "Indique el GTQ recibido total (todo el dinero real que ingresó). El reparto debe cuadrar contra ese monto, no contra USDT×tasa.",
      };
    }
    try {
      totalFiat = dec(gtqRecibidoRaw);
    } catch {
      return { error: "GTQ recibido total inválido" };
    }
    if (allocs.length === 0) {
      return { error: "Debe registrar el reparto del dinero recibido (al menos una línea)." };
    }
    if (pnlBasisGtq.sub(totalFiat).gt(new Prisma.Decimal("0.01"))) {
      return {
        error:
          "El GTQ aplicado hoy (USDT entregado × tasa) no puede ser mayor al GTQ recibido total. Aumente el total recibido o ajuste USDT/tasa.",
      };
    }
    const sumEq = sumAllocationsGtqEquivalent(allocs, rateFiatPerUsdt);
    if (!allocationsMatchTotalFiat(allocs, totalFiat, rateFiatPerUsdt)) {
      return {
        error: `La suma del reparto (${sumEq.toFixed(2)} GTQ equivalente) debe igualar el GTQ recibido total (${totalFiat.toFixed(2)}), no el GTQ aplicado hoy (${pnlBasisGtq.toFixed(2)}). ${formatGtqDiffMessage(totalFiat, sumEq)}`,
      };
    }
  } else {
    try {
      totalFiat = dec(String(formData.get("totalFiat") ?? ""));
    } catch {
      return { error: "Total GTQ inválido" };
    }
  }

  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  const operativeInstant = parseOperativeDateTimeFromForm(formData);
  const dayKey = dayKeyFromDateLocal(operativeInstant);

  const inv = await computeInventoryFromDb();
  const usdtQty = Number(usdtAmount.toString());

  let profitGtq: Prisma.Decimal | null = null;
  let profitUsd: Prisma.Decimal | null = null;

  if (side === OtcSide.CLIENT_BUYS_USDT) {
    const extraOperatorUsdt = Number(sumOperatorUsdtPayoutTotal(allocs).toString());
    const usdtNeeded = usdtQty + extraOperatorUsdt;
    if (usdtNeeded > inv.usdt + 1e-9) {
      return {
        error: `Inventario USDT insuficiente (venta ${usdtQty.toFixed(2)} + pago operador ${extraOperatorUsdt.toFixed(2)} = ${usdtNeeded.toFixed(2)}; disponible ${inv.usdt.toFixed(2)})`,
      };
    }
    const avg = inv.avgGtqPerUsdt;
    const cogs = usdtQty * avg;
    const rev = Number(pnlBasisGtq.toString());
    const p = rev - cogs;
    profitGtq = new Prisma.Decimal(p.toFixed(2));
    profitUsd = new Prisma.Decimal(gtqToUsdEstimate(p).toFixed(4));
  } else {
    profitGtq = new Prisma.Decimal(0);
    profitUsd = new Prisma.Decimal(0);
  }

  let opId: string;
  try {
    opId = await prisma.$transaction(async (tx) => {
      const op = await tx.otcOperation.create({
        data: {
          clientId,
          side,
          usdtAmount,
          rateFiatPerUsdt,
          totalFiat,
          fiatCurrency,
          pnlBasisGtq,
          profitGtq,
          profitUsd,
          notes,
          dayKey,
          createdAt: operativeInstant,
          createdByUserId: user!.id,
        },
      });

      const clientRow = await tx.client.findUnique({
        where: { id: clientId },
        select: { name: true },
      });
      const clientName = clientRow?.name ?? "";

      const opCtx = {
        id: op.id,
        ref: op.ref,
        clientId: op.clientId,
        dayKey: op.dayKey,
        createdAt: op.createdAt,
        ledgerAt: operativeInstant,
      };

      for (const a of allocs) {
        const allocRow = await tx.otcAllocation.create({
          data: {
            operationId: op.id,
            destination: a.destination,
            operatorId: a.destination === "OPERATOR" ? a.operatorId : null,
            bankAccountId: a.destination === "EVEREX_BANK" ? a.bankAccountId : null,
            amount: a.amount,
            currency: a.currency,
            reference: a.reference,
            notes: a.notes,
            createdAt: operativeInstant,
          },
        });

        await applyOtcAllocationLedgerInTx(tx, allocRow, opCtx, clientName, user!.id);
      }

      const pendingGtq = totalFiat.sub(pnlBasisGtq);
      if (side === OtcSide.CLIENT_BUYS_USDT && pendingGtq.gt(new Prisma.Decimal("0.01"))) {
        await tx.everexPayable.create({
          data: {
            ...buildClientAdvancePayableCreditor(clientId, clientName),
            originalAmount: pendingGtq,
            balance: pendingGtq,
            currency: FiatCurrency.GTQ,
            reason: `Anticipo / USDT por entregar (OTC ${op.ref.slice(0, 8)})`,
            notes: [
              `GTQ recibido ${totalFiat.toFixed(2)} · aplicado hoy a venta USDT ${pnlBasisGtq.toFixed(2)} · pendiente ${pendingGtq.toFixed(2)}.`,
              `Operación OTC: ${op.id} · ref ${op.ref}.`,
              clientAdvancePayableNotesMarker(clientId),
            ].join("\n"),
            dayKey,
            createdByUserId: user!.id,
            active: true,
          },
        });
      }

      return op.id;
    });
  } catch (e) {
    console.error(e);
    return { error: e instanceof Error ? e.message : "No se pudo guardar" };
  }

  revalidatePath("/operaciones");
  revalidatePath("/dashboard");
  revalidatePath("/bancos");
  revalidatePath("/operadores");
  revalidatePath("/deudas");
  revalidatePath("/estado-financiero");
  revalidatePath("/clientes");
  redirect(`/operaciones/${opId}`);
}

/** Reparto inicial para ventas CLIENT_BUYS_USDT guardadas sin líneas (solo si aún no hay repartos). */
export async function addOtcOperationAllocations(
  _prev: { error?: string; ok?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const user = await getSessionUser();
  if (!canEditOtcOperation(user)) return { error: "No autorizado" };

  const operationId = String(formData.get("operationId") ?? "").trim();
  if (!operationId) return { error: "Operación inválida" };

  let allocs;
  try {
    allocs = parseOtcAllocationsFromFormData(formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Repartos inválidos" };
  }

  const op = await prisma.otcOperation.findUnique({
    where: { id: operationId },
    include: { allocations: { select: { id: true } }, client: { select: { name: true } } },
  });
  if (!op) return { error: "Operación no encontrada" };
  if (op.side !== OtcSide.CLIENT_BUYS_USDT) {
    return { error: "Solo aplica a operaciones cliente compra USDT." };
  }
  if (op.fiatCurrency !== FiatCurrency.GTQ) {
    return { error: "El reparto automático en esta pantalla es solo para operaciones en GTQ." };
  }
  if (op.allocations.length > 0) {
    return {
      error:
        "Esta operación ya tiene reparto. Use «Editar» en el detalle de la operación para modificar cliente, montos y líneas.",
    };
  }
  if (allocs.length === 0) {
    return { error: "Agregue al menos una línea de reparto." };
  }

  const overrideRaw = String(formData.get("totalGtqRecibido") ?? "").trim();
  let targetTotalFiat = op.totalFiat;
  if (overrideRaw) {
    try {
      const o = dec(overrideRaw);
      if (o.sub(op.pnlBasisGtq).lt(new Prisma.Decimal("-0.01"))) {
        return {
          error:
            "El GTQ recibido total no puede ser menor al GTQ aplicado hoy (USDT entregado × tasa de la operación).",
        };
      }
      targetTotalFiat = o;
    } catch {
      return { error: "GTQ recibido total inválido." };
    }
  }

  const sumEq = sumAllocationsGtqEquivalent(allocs, op.rateFiatPerUsdt);
  if (!allocationsMatchTotalFiat(allocs, targetTotalFiat, op.rateFiatPerUsdt)) {
    return {
      error: `La suma del reparto (${sumEq.toFixed(2)} GTQ equivalente) debe igualar el GTQ recibido total (${targetTotalFiat.toFixed(2)} GTQ). ${formatGtqDiffMessage(targetTotalFiat, sumEq)}`,
    };
  }

  const extraOperatorUsdt = Number(sumOperatorUsdtPayoutTotal(allocs).toString());
  if (extraOperatorUsdt > 0) {
    const inv = await computeInventoryFromDb();
    if (extraOperatorUsdt > inv.usdt + 1e-9) {
      return {
        error: `Inventario USDT insuficiente para pago a operador (${extraOperatorUsdt.toFixed(2)} USDT; disponible ${inv.usdt.toFixed(2)})`,
      };
    }
  }

  const clientName = op.client.name;
  const repartoLedgerInstant = parseOperativeDateTimeFromForm(formData);

  try {
    await prisma.$transaction(async (tx) => {
      const totalChanged = !targetTotalFiat.sub(op.totalFiat).abs().lte(new Prisma.Decimal("0.01"));
      if (totalChanged) {
        await tx.otcOperation.update({
          where: { id: op.id },
          data: { totalFiat: targetTotalFiat },
        });
      }

      const opCtx = {
        id: op.id,
        ref: op.ref,
        clientId: op.clientId,
        dayKey: op.dayKey,
        createdAt: op.createdAt,
        ledgerAt: repartoLedgerInstant,
      };

      for (const a of allocs) {
        const allocRow = await tx.otcAllocation.create({
          data: {
            operationId: op.id,
            destination: a.destination,
            operatorId: a.destination === "OPERATOR" ? a.operatorId : null,
            bankAccountId: a.destination === "EVEREX_BANK" ? a.bankAccountId : null,
            amount: a.amount,
            currency: a.currency,
            reference: a.reference,
            notes: a.notes,
            createdAt: repartoLedgerInstant,
          },
        });

        await applyOtcAllocationLedgerInTx(tx, allocRow, opCtx, clientName, user!.id);
      }

      const pendingGtq = targetTotalFiat.sub(op.pnlBasisGtq);
      if (pendingGtq.gt(new Prisma.Decimal("0.01"))) {
        const existing = await tx.everexPayable.findFirst({
          where: {
            active: true,
            creditorType: EverexCreditorType.CLIENT,
            notes: { contains: clientAdvancePayableNotesMarker(op.clientId) },
            AND: [
              { reason: { contains: CLIENT_OTC_ADVANCE_REASON_SUBSTR } },
              { reason: { contains: op.ref.slice(0, 8) } },
            ],
          },
          select: { id: true, balance: true },
        });
        if (!existing) {
          await tx.everexPayable.create({
            data: {
              ...buildClientAdvancePayableCreditor(op.clientId, clientName),
              originalAmount: pendingGtq,
              balance: pendingGtq,
              currency: FiatCurrency.GTQ,
              reason: `Anticipo / USDT por entregar (OTC ${op.ref.slice(0, 8)})`,
              notes: [
                `GTQ recibido ${targetTotalFiat.toFixed(2)} · aplicado hoy a venta USDT ${op.pnlBasisGtq.toFixed(2)} · pendiente ${pendingGtq.toFixed(2)}.`,
                `Operación OTC: ${op.id} · ref ${op.ref}.`,
                clientAdvancePayableNotesMarker(op.clientId),
              ].join("\n"),
              dayKey: op.dayKey,
              createdByUserId: user!.id,
              active: true,
            },
          });
        } else {
          const payCount = await tx.everexPayablePayment.count({ where: { payableId: existing.id } });
          const noteBlock = [
            `GTQ recibido ${targetTotalFiat.toFixed(2)} · aplicado hoy a venta USDT ${op.pnlBasisGtq.toFixed(2)} · pendiente ${pendingGtq.toFixed(2)}.`,
            `Operación OTC: ${op.id} · ref ${op.ref}.`,
            clientAdvancePayableNotesMarker(op.clientId),
          ].join("\n");
          if (payCount === 0) {
            await tx.everexPayable.update({
              where: { id: existing.id },
              data: {
                originalAmount: pendingGtq,
                balance: pendingGtq,
                reason: `Anticipo / USDT por entregar (OTC ${op.ref.slice(0, 8)})`,
                notes: noteBlock,
              },
            });
          } else {
            await tx.everexPayable.update({
              where: { id: existing.id },
              data: { notes: noteBlock },
            });
          }
        }
      }
    });
  } catch (e) {
    console.error(e);
    return { error: e instanceof Error ? e.message : "No se pudo guardar el reparto" };
  }

  revalidatePath("/operaciones");
  revalidatePath(`/operaciones/${operationId}`);
  revalidatePath("/dashboard");
  revalidatePath("/bancos");
  revalidatePath("/operadores");
  revalidatePath("/estado-financiero");
  revalidatePath("/deudas");
  revalidatePath("/clientes");

  return { ok: true };
}

export async function updateOtcOperation(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canEditOtcOperation(user)) return { error: "No autorizado" };

  const operationId = String(formData.get("operationId") ?? "").trim();
  if (!operationId) return { error: "Operación inválida" };

  const existing = await prisma.otcOperation.findUnique({
    where: { id: operationId },
    include: { allocations: true },
  });
  if (!existing) return { error: "Operación no encontrada" };
  if (existing.fiatCurrency !== FiatCurrency.GTQ) {
    return { error: "Solo se pueden editar operaciones en GTQ desde esta pantalla." };
  }

  const beforeSnap = otcAuditJson(existing);

  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId) return { error: "Cliente requerido" };

  const side = String(formData.get("side") ?? "") as OtcSide;
  if (!Object.values(OtcSide).includes(side)) return { error: "Tipo de operación inválido" };

  let allocs;
  try {
    allocs = parseOtcAllocationsFromFormData(formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Repartos inválidos" };
  }

  if (side === OtcSide.CLIENT_SELLS_USDT && allocs.length > 0) {
    return { error: "La distribución de fondos solo aplica a cliente compra USDT GTQ." };
  }

  const usdtAmount = dec(String(formData.get("usdtAmount") ?? ""));
  const rateFiatPerUsdt = dec(String(formData.get("rateFiatPerUsdt") ?? ""));
  const pnlBasisGtq = usdtAmount.mul(rateFiatPerUsdt);

  let totalFiat: Prisma.Decimal;
  if (side === OtcSide.CLIENT_BUYS_USDT) {
    const gtqRecibidoRaw =
      String(formData.get("gtqRecibidoTotal") ?? "").trim() || String(formData.get("totalFiat") ?? "").trim();
    if (!gtqRecibidoRaw) {
      return {
        error:
          "Indique el GTQ recibido total. El reparto debe cuadrar contra ese monto, no contra USDT×tasa.",
      };
    }
    try {
      totalFiat = dec(gtqRecibidoRaw);
    } catch {
      return { error: "GTQ recibido total inválido" };
    }
    if (allocs.length === 0) {
      return { error: "Debe registrar el reparto del dinero recibido (al menos una línea)." };
    }
    if (pnlBasisGtq.sub(totalFiat).gt(new Prisma.Decimal("0.01"))) {
      return {
        error:
          "El GTQ aplicado hoy (USDT entregado × tasa) no puede ser mayor al GTQ recibido total.",
      };
    }
    const sumEq = sumAllocationsGtqEquivalent(allocs, rateFiatPerUsdt);
    if (!allocationsMatchTotalFiat(allocs, totalFiat, rateFiatPerUsdt)) {
      return {
        error: `La suma del reparto (${sumEq.toFixed(2)} GTQ equivalente) debe igualar el GTQ recibido total (${totalFiat.toFixed(2)}). ${formatGtqDiffMessage(totalFiat, sumEq)}`,
      };
    }
  } else {
    try {
      totalFiat = dec(String(formData.get("totalFiat") ?? ""));
    } catch {
      return { error: "Total GTQ inválido" };
    }
  }

  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  const operativeInstant = parseOperativeDateTimeFromForm(formData);
  const dayKey = dayKeyFromDateLocal(operativeInstant);

  const inv = await computeInventoryFromDb();
  const usdtQty = Number(usdtAmount.toString());
  let releasedUsdt = 0;
  if (existing.side === OtcSide.CLIENT_BUYS_USDT) {
    releasedUsdt = usdtConsumedByBuyOp(existing.usdtAmount, existing.allocations);
  } else {
    releasedUsdt = -Number(existing.usdtAmount.toString());
  }
  const syntheticInv = inv.usdt + releasedUsdt;

  let profitGtq: Prisma.Decimal | null = null;
  let profitUsd: Prisma.Decimal | null = null;

  if (side === OtcSide.CLIENT_BUYS_USDT) {
    const extraOperatorUsdt = Number(sumOperatorUsdtPayoutTotal(allocs).toString());
    const usdtNeeded = usdtQty + extraOperatorUsdt;
    if (usdtNeeded > syntheticInv + 1e-9) {
      return {
        error: `Inventario USDT insuficiente tras liberar la operación anterior (${usdtNeeded.toFixed(2)} necesarios; disponible estimado ${syntheticInv.toFixed(2)})`,
      };
    }
    const avg = inv.avgGtqPerUsdt;
    const cogs = usdtQty * avg;
    const rev = Number(pnlBasisGtq.toString());
    const p = rev - cogs;
    profitGtq = new Prisma.Decimal(p.toFixed(2));
    profitUsd = new Prisma.Decimal(gtqToUsdEstimate(p).toFixed(4));
  } else {
    profitGtq = new Prisma.Decimal(0);
    profitUsd = new Prisma.Decimal(0);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const linkedPayables = await tx.everexPayable.findMany({
        where: {
          active: true,
          creditorType: EverexCreditorType.CLIENT,
          notes: { contains: `Operación OTC: ${operationId}` },
        },
        select: { id: true },
      });
      for (const p of linkedPayables) {
        const cnt = await tx.everexPayablePayment.count({ where: { payableId: p.id } });
        if (cnt > 0) {
          throw new Error(
            "Hay pagos aplicados al anticipo del cliente en Deudas. Revise o revierta esos pagos antes de editar la operación.",
          );
        }
      }

      const allocationIds = existing.allocations.map((a) => a.id);
      await revertOtcOperationLedgerInTx(tx, operationId, allocationIds, {
        legacyOrphanBankMovements: true,
        legacyOperationRefStatementEntries: true,
      });

      await tx.otcAllocation.deleteMany({ where: { operationId } });

      if (linkedPayables.length > 0) {
        await tx.everexPayable.deleteMany({
          where: { id: { in: linkedPayables.map((x) => x.id) } },
        });
      }

      const clientRow = await tx.client.findUnique({
        where: { id: clientId },
        select: { name: true },
      });
      const clientName = clientRow?.name ?? "";

      await tx.otcOperation.update({
        where: { id: operationId },
        data: {
          clientId,
          side,
          usdtAmount,
          rateFiatPerUsdt,
          totalFiat,
          fiatCurrency: FiatCurrency.GTQ,
          pnlBasisGtq,
          profitGtq,
          profitUsd,
          notes,
          dayKey,
          createdAt: operativeInstant,
          mxnLiquidation: null,
          usdtPipelineReceived: null,
          gtqPaidToClient: null,
          profitUsdt: null,
        },
      });

      const opAfter = await tx.otcOperation.findUniqueOrThrow({
        where: { id: operationId },
      });

      const opCtx = {
        id: opAfter.id,
        ref: opAfter.ref,
        clientId: opAfter.clientId,
        dayKey: opAfter.dayKey,
        createdAt: opAfter.createdAt,
        ledgerAt: operativeInstant,
      };

      for (const a of allocs) {
        const allocRow = await tx.otcAllocation.create({
          data: {
            operationId: opAfter.id,
            destination: a.destination,
            operatorId: a.destination === "OPERATOR" ? a.operatorId : null,
            bankAccountId: a.destination === "EVEREX_BANK" ? a.bankAccountId : null,
            amount: a.amount,
            currency: a.currency,
            reference: a.reference,
            notes: a.notes,
            createdAt: operativeInstant,
          },
        });
        await applyOtcAllocationLedgerInTx(tx, allocRow, opCtx, clientName, user!.id);
      }

      const pendingGtq = totalFiat.sub(pnlBasisGtq);
      if (side === OtcSide.CLIENT_BUYS_USDT && pendingGtq.gt(new Prisma.Decimal("0.01"))) {
        await tx.everexPayable.create({
          data: {
            ...buildClientAdvancePayableCreditor(clientId, clientName),
            originalAmount: pendingGtq,
            balance: pendingGtq,
            currency: FiatCurrency.GTQ,
            reason: `Anticipo / USDT por entregar (OTC ${opAfter.ref.slice(0, 8)})`,
            notes: [
              `GTQ recibido ${totalFiat.toFixed(2)} · aplicado hoy a venta USDT ${pnlBasisGtq.toFixed(2)} · pendiente ${pendingGtq.toFixed(2)}.`,
              `Operación OTC: ${opAfter.id} · ref ${opAfter.ref}.`,
              clientAdvancePayableNotesMarker(clientId),
            ].join("\n"),
            dayKey,
            createdByUserId: user!.id,
            active: true,
          },
        });
      }

      const finalRow = await tx.otcOperation.findUniqueOrThrow({ where: { id: operationId } });
      await writeAppAuditLogInTx(tx, {
        userId: user!.id,
        action: "OTC_OPERATION_UPDATE",
        entityType: "OtcOperation",
        entityId: operationId,
        payloadBefore: beforeSnap,
        payloadAfter: otcAuditJson(finalRow),
        reason: null,
      });
    });
  } catch (e) {
    console.error(e);
    return { error: e instanceof Error ? e.message : "No se pudo guardar" };
  }

  revalidatePath("/operaciones");
  revalidatePath(`/operaciones/${operationId}`);
  revalidatePath("/dashboard");
  revalidatePath("/bancos");
  revalidatePath("/operadores");
  revalidatePath("/deudas");
  revalidatePath("/estado-financiero");
  revalidatePath("/clientes");
  redirect(`/operaciones/${operationId}`);
}

export async function deleteOtcOperation(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canDeleteOtcOperation(user)) return { error: "Solo administración puede eliminar operaciones OTC." };

  const operationId = String(formData.get("operationId") ?? "").trim();
  if (!operationId) return { error: "Operación inválida" };

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Indique el motivo de la eliminación." };

  const op = await prisma.otcOperation.findUnique({
    where: { id: operationId },
    include: { allocations: { select: { id: true } } },
  });
  if (!op) return { error: "Operación no encontrada" };

  const beforeSnap = otcAuditJson(op);

  const linkedPayables = await prisma.everexPayable.findMany({
    where: {
      active: true,
      creditorType: EverexCreditorType.CLIENT,
      notes: { contains: `Operación OTC: ${operationId}` },
    },
    select: { id: true },
  });
  for (const p of linkedPayables) {
    const cnt = await prisma.everexPayablePayment.count({ where: { payableId: p.id } });
    if (cnt > 0) {
      return {
        error:
          "Existen pagos aplicados al anticipo del cliente. Cancele o ajuste en Deudas antes de eliminar la operación.",
      };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const allocationIds = op.allocations.map((a) => a.id);
      await revertOtcOperationLedgerInTx(tx, op.id, allocationIds, {
        legacyOrphanBankMovements: true,
        legacyOperationRefStatementEntries: true,
      });

      if (linkedPayables.length > 0) {
        await tx.everexPayable.deleteMany({
          where: { id: { in: linkedPayables.map((x) => x.id) } },
        });
      }

      await tx.otcOperation.delete({ where: { id: op.id } });

      await writeAppAuditLogInTx(tx, {
        userId: user!.id,
        action: "OTC_OPERATION_DELETE",
        entityType: "OtcOperation",
        entityId: operationId,
        payloadBefore: beforeSnap,
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
  revalidatePath("/bancos");
  revalidatePath("/operadores");
  revalidatePath("/proveedores");
  revalidatePath("/estado-financiero");
  revalidatePath("/deudas");
  revalidatePath("/clientes");
  redirect("/operaciones");
}
