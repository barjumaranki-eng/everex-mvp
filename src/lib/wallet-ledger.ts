import {
  Prisma,
  WalletMovimientoOrigen,
  WalletMovimientoTipo,
  type OtcSide,
} from "@prisma/client";
import { OtcSide as OtcSideEnum } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { purchaseWhereForInventory } from "@/lib/inventory";

export type WalletMovimientoInput = {
  tipo: WalletMovimientoTipo;
  origen: WalletMovimientoOrigen;
  usdtMonto: Prisma.Decimal | number | string;
  referenciaId: string;
  etiqueta?: string | null;
  dayKey: string;
  createdAt: Date;
};

function decUsdt(x: Prisma.Decimal | number | string): Prisma.Decimal {
  if (x instanceof Prisma.Decimal) return x;
  return new Prisma.Decimal(String(x));
}

export async function createWalletMovimientoInTx(
  tx: Prisma.TransactionClient,
  input: WalletMovimientoInput,
): Promise<void> {
  const monto = decUsdt(input.usdtMonto);
  if (monto.lte(0)) return;
  await tx.walletMovimiento.create({
    data: {
      tipo: input.tipo,
      origen: input.origen,
      usdtMonto: monto,
      referenciaId: input.referenciaId,
      etiqueta: input.etiqueta?.trim() || null,
      dayKey: input.dayKey,
      createdAt: input.createdAt,
    },
  });
}

export async function deleteWalletMovimientosByReferenciaInTx(
  tx: Prisma.TransactionClient,
  referenciaId: string,
): Promise<void> {
  await tx.walletMovimiento.deleteMany({ where: { referenciaId } });
}

export async function deleteWalletMovimientosByReferenciasInTx(
  tx: Prisma.TransactionClient,
  referenciaIds: string[],
): Promise<void> {
  if (referenciaIds.length === 0) return;
  await tx.walletMovimiento.deleteMany({ where: { referenciaId: { in: referenciaIds } } });
}

/** USDT efectivo en movimiento de operación OTC (entregado o recibido). */
export function usdtMontoEfectivoOtc(
  side: OtcSide,
  usdtAmount: Prisma.Decimal,
  usdtEntregadoReal: Prisma.Decimal | null,
): Prisma.Decimal {
  const real = usdtEntregadoReal ?? usdtAmount;
  return real.gt(0) ? real : usdtAmount;
}

export async function recordOtcOperationWalletInTx(
  tx: Prisma.TransactionClient,
  params: {
    operationId: string;
    side: OtcSide;
    usdtAmount: Prisma.Decimal;
    usdtEntregadoReal: Prisma.Decimal | null;
    clientName: string;
    ref: string;
    dayKey: string;
    createdAt: Date;
  },
): Promise<void> {
  const monto = usdtMontoEfectivoOtc(params.side, params.usdtAmount, params.usdtEntregadoReal);
  if (params.side === OtcSideEnum.CLIENT_SELLS_USDT) {
    await createWalletMovimientoInTx(tx, {
      tipo: WalletMovimientoTipo.ENTRADA,
      origen: WalletMovimientoOrigen.CLIENTE_VENDE,
      usdtMonto: monto,
      referenciaId: params.operationId,
      etiqueta: `Cliente vende USDT · ${params.clientName} (${params.ref.slice(0, 8)})`,
      dayKey: params.dayKey,
      createdAt: params.createdAt,
    });
    return;
  }
  if (params.side === OtcSideEnum.CLIENT_BUYS_USDT) {
    await createWalletMovimientoInTx(tx, {
      tipo: WalletMovimientoTipo.SALIDA,
      origen: WalletMovimientoOrigen.VENTA_CLIENTE,
      usdtMonto: monto,
      referenciaId: params.operationId,
      etiqueta: `Venta a cliente · ${params.clientName} (${params.ref.slice(0, 8)})`,
      dayKey: params.dayKey,
      createdAt: params.createdAt,
    });
  }
}

export async function recordOperatorUsdtPayoutWalletInTx(
  tx: Prisma.TransactionClient,
  params: {
    allocationId: string;
    usdtMonto: Prisma.Decimal;
    operatorName: string;
    operationRef: string;
    dayKey: string;
    createdAt: Date;
  },
): Promise<void> {
  await createWalletMovimientoInTx(tx, {
    tipo: WalletMovimientoTipo.SALIDA,
    origen: WalletMovimientoOrigen.PAGO_OPERADOR,
    usdtMonto: params.usdtMonto,
    referenciaId: params.allocationId,
    etiqueta: `Pago operador USDT · ${params.operatorName} (OTC ${params.operationRef.slice(0, 8)})`,
    dayKey: params.dayKey,
    createdAt: params.createdAt,
  });
}

export async function recordUsdtPurchaseWalletInTx(
  tx: Prisma.TransactionClient,
  params: {
    purchaseId: string;
    usdtAmount: Prisma.Decimal;
    label: string;
    dayKey: string;
    createdAt: Date;
  },
): Promise<void> {
  await createWalletMovimientoInTx(tx, {
    tipo: WalletMovimientoTipo.ENTRADA,
    origen: WalletMovimientoOrigen.COMPRA_PROVEEDOR,
    usdtMonto: params.usdtAmount,
    referenciaId: params.purchaseId,
    etiqueta: params.label,
    dayKey: params.dayKey,
    createdAt: params.createdAt,
  });
}

export async function recordOperatorMxnUsdtPayoutWalletInTx(
  tx: Prisma.TransactionClient,
  params: {
    settlementId: string;
    usdtPaid: Prisma.Decimal;
    operatorName: string;
    ref: string;
    dayKey: string;
    createdAt: Date;
  },
): Promise<void> {
  await createWalletMovimientoInTx(tx, {
    tipo: WalletMovimientoTipo.SALIDA,
    origen: WalletMovimientoOrigen.PAGO_OPERADOR,
    usdtMonto: params.usdtPaid,
    referenciaId: params.settlementId,
    etiqueta: `Liquidación MXN→USDT · ${params.operatorName} (${params.ref.slice(0, 8)})`,
    dayKey: params.dayKey,
    createdAt: params.createdAt,
  });
}

export type WalletLedgerRow = {
  id: string;
  createdAt: Date;
  dayKey: string;
  tipo: WalletMovimientoTipo;
  origen: WalletMovimientoOrigen;
  etiqueta: string;
  usdtMonto: number;
  signedUsdt: number;
  saldoRemanente: number;
};

export type WalletSummary = {
  saldoUsdt: number;
  avgGtqPerUsdt: number;
  totalEntradas: number;
  totalSalidas: number;
  movimientoCount: number;
};

function signedAmount(tipo: WalletMovimientoTipo, monto: number): number {
  return tipo === WalletMovimientoTipo.ENTRADA ? monto : -monto;
}

/** Costo prom. GTQ/USDT ponderado por entradas con costo en GTQ (compras + cliente vende). */
async function computeWalletAvgGtqPerUsdt(): Promise<number> {
  const entradas = await prisma.walletMovimiento.findMany({
    where: {
      tipo: WalletMovimientoTipo.ENTRADA,
      origen: {
        in: [WalletMovimientoOrigen.COMPRA_PROVEEDOR, WalletMovimientoOrigen.CLIENTE_VENDE],
      },
    },
    select: { origen: true, referenciaId: true, usdtMonto: true },
  });

  let usdtSum = 0;
  let gtqSum = 0;

  const purchaseIds = entradas
    .filter((e) => e.origen === WalletMovimientoOrigen.COMPRA_PROVEEDOR)
    .map((e) => e.referenciaId);
  const opIds = entradas
    .filter((e) => e.origen === WalletMovimientoOrigen.CLIENTE_VENDE)
    .map((e) => e.referenciaId);

  const [purchases, ops] = await Promise.all([
    purchaseIds.length
      ? prisma.usdtPurchase.findMany({
          where: { id: { in: purchaseIds } },
          select: { id: true, gtqTotal: true, usdtAmount: true },
        })
      : [],
    opIds.length
      ? prisma.otcOperation.findMany({
          where: { id: { in: opIds } },
          select: { id: true, totalFiat: true, usdtAmount: true, usdtEntregadoReal: true },
        })
      : [],
  ]);

  const purchaseMap = new Map(purchases.map((p) => [p.id, p]));
  const opMap = new Map(ops.map((o) => [o.id, o]));

  for (const e of entradas) {
    const usdt = Number(e.usdtMonto.toString());
    if (usdt <= 0) continue;
    if (e.origen === WalletMovimientoOrigen.COMPRA_PROVEEDOR) {
      const p = purchaseMap.get(e.referenciaId);
      if (!p) continue;
      gtqSum += Number(p.gtqTotal.toString());
      usdtSum += usdt;
    } else if (e.origen === WalletMovimientoOrigen.CLIENTE_VENDE) {
      const o = opMap.get(e.referenciaId);
      if (!o) continue;
      gtqSum += Number(o.totalFiat.toString());
      usdtSum += usdt;
    }
  }

  return usdtSum > 0 ? gtqSum / usdtSum : 0;
}

export async function loadWalletSummary(): Promise<WalletSummary> {
  const [aggIn, aggOut, count, saldoUsdt, avgGtqPerUsdt] = await Promise.all([
    prisma.walletMovimiento.aggregate({
      where: { tipo: WalletMovimientoTipo.ENTRADA },
      _sum: { usdtMonto: true },
    }),
    prisma.walletMovimiento.aggregate({
      where: { tipo: WalletMovimientoTipo.SALIDA },
      _sum: { usdtMonto: true },
    }),
    prisma.walletMovimiento.count(),
    computeWalletSaldoFromMovimientos(),
    computeWalletAvgGtqPerUsdt(),
  ]);

  const totalEntradas = Number(aggIn._sum.usdtMonto?.toString() ?? "0");
  const totalSalidas = Number(aggOut._sum.usdtMonto?.toString() ?? "0");

  return {
    saldoUsdt,
    avgGtqPerUsdt,
    totalEntradas,
    totalSalidas,
    movimientoCount: count,
  };
}

export async function computeWalletSaldoFromMovimientos(): Promise<number> {
  const rows = await prisma.walletMovimiento.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { tipo: true, usdtMonto: true },
  });
  let saldo = 0;
  for (const r of rows) {
    const n = Number(r.usdtMonto.toString());
    saldo += signedAmount(r.tipo, n);
  }
  return saldo;
}

const ORIGEN_LABEL: Record<WalletMovimientoOrigen, string> = {
  COMPRA_PROVEEDOR: "Compra USDT",
  CLIENTE_VENDE: "Cliente vende USDT",
  VENTA_CLIENTE: "Venta a cliente",
  PAGO_OPERADOR: "Pago operador",
};

export function origenLabel(origen: WalletMovimientoOrigen): string {
  return ORIGEN_LABEL[origen] ?? origen;
}

export async function loadWalletLedgerPage(page: number, pageSize: number): Promise<{
  rows: WalletLedgerRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const total = await prisma.walletMovimiento.count();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const all = await prisma.walletMovimiento.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      createdAt: true,
      dayKey: true,
      tipo: true,
      origen: true,
      etiqueta: true,
      usdtMonto: true,
    },
  });

  const saldoById = new Map<string, number>();
  let run = 0;
  for (const m of all) {
    const n = Number(m.usdtMonto.toString());
    run += signedAmount(m.tipo, n);
    saldoById.set(m.id, run);
  }

  const desc = [...all].reverse();
  const start = (safePage - 1) * pageSize;
  const slice = desc.slice(start, start + pageSize);

  const rows: WalletLedgerRow[] = slice.map((m) => {
    const usdtMonto = Number(m.usdtMonto.toString());
    const signed = signedAmount(m.tipo, usdtMonto);
    return {
      id: m.id,
      createdAt: m.createdAt,
      dayKey: m.dayKey,
      tipo: m.tipo,
      origen: m.origen,
      etiqueta: m.etiqueta?.trim() || origenLabel(m.origen),
      usdtMonto,
      signedUsdt: signed,
      saldoRemanente: saldoById.get(m.id) ?? 0,
    };
  });

  return { rows, total, page: safePage, pageSize, totalPages };
}

/** Backfill wallet desde datos históricos (compras inventario, OTC, liquidaciones operador). */
export async function backfillWalletMovimientosFromDb(): Promise<{ created: number }> {
  const existing = await prisma.walletMovimiento.count();
  if (existing > 0) {
    return { created: 0 };
  }

  let created = 0;
  await prisma.$transaction(async (tx) => {
    const purchases = await tx.usdtPurchase.findMany({
      where: purchaseWhereForInventory(),
      include: { operator: true, provider: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    for (const p of purchases) {
      const label =
        p.counterparty === "PROVIDER_MX"
          ? `Compra proveedor MX · ${p.provider?.name ?? "—"}`
          : `Compra operador · ${p.operator?.name ?? "—"}`;
      await recordUsdtPurchaseWalletInTx(tx, {
        purchaseId: p.id,
        usdtAmount: p.usdtAmount,
        label,
        dayKey: p.dayKey,
        createdAt: p.createdAt,
      });
      created += 1;
    }

    const ops = await tx.otcOperation.findMany({
      include: { client: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    for (const op of ops) {
      await recordOtcOperationWalletInTx(tx, {
        operationId: op.id,
        side: op.side,
        usdtAmount: op.usdtAmount,
        usdtEntregadoReal: op.usdtEntregadoReal,
        clientName: op.client.name,
        ref: op.ref,
        dayKey: op.dayKey,
        createdAt: op.createdAt,
      });
      created += 1;

      const allocs = await tx.otcAllocation.findMany({
        where: { operationId: op.id, destination: "OPERATOR", currency: "USDT" },
        include: { operator: true },
      });
      for (const a of allocs) {
        await recordOperatorUsdtPayoutWalletInTx(tx, {
          allocationId: a.id,
          usdtMonto: a.amount,
          operatorName: a.operator?.name ?? "Operador",
          operationRef: op.ref,
          dayKey: op.dayKey,
          createdAt: a.createdAt,
        });
        created += 1;
      }
    }

    const settlements = await tx.operatorMxnUsdtSettlement.findMany({
      include: { operator: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    for (const s of settlements) {
      await recordOperatorMxnUsdtPayoutWalletInTx(tx, {
        settlementId: s.id,
        usdtPaid: s.usdtPaid,
        operatorName: s.operator.name,
        ref: s.ref,
        dayKey: s.dayKey,
        createdAt: s.createdAt,
      });
      created += 1;
    }
  });

  return { created };
}
