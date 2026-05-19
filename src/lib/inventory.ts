import { OtcSide, Prisma, PurchaseCounterparty } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function d(x: Prisma.Decimal | null | undefined): number {
  if (x == null) return 0;
  const n = Number(x.toString());
  return Number.isFinite(n) ? n : 0;
}

/** Compras que cuentan para inventario: OPERATOR o PROVIDER_MX, sin exigir operatorId ni providerId. */
export const purchaseWhereForInventory = (): Prisma.UsdtPurchaseWhereInput => ({
  OR: [
    { counterparty: PurchaseCounterparty.OPERATOR },
    { counterparty: PurchaseCounterparty.PROVIDER_MX },
  ],
  usdtAmount: { gt: 0 },
});

export type InventoryPurchaseRowDebug = {
  id: string;
  dayKey: string;
  counterparty: PurchaseCounterparty;
  operatorId: string | null;
  providerId: string | null;
  usdt: number;
  gtq: number;
};

export type InventoryDiagnostics = {
  /** Filas que cumplen el filtro (mismo criterio que aggregate). */
  totalPurchaseRows: number;
  operatorPurchaseRows: number;
  providerPurchaseRows: number;
  purchaseSumUsdt: number;
  purchaseSumGtq: number;
  ventasUsdtSubtotal: number;
  operatorMxnUsdtPaidSubtotal: number;
  inventarioFinalUsdt: number;
  purchaseRowsRecent: InventoryPurchaseRowDebug[];
};

/**
 * Inventario = SUM(UsdtPurchase usdt, OPERATOR+PROVIDER_MX) − ventas OTC CLIENT_BUY − pagos MXN→USDT.
 * Totales vía `aggregate` en BD (no depende de operatorId ni providerId).
 */
export async function computeInventoryFromDb(): Promise<{
  usdt: number;
  gtqBasis: number;
  avgGtqPerUsdt: number;
  diagnostics: InventoryDiagnostics;
}> {
  const wherePurchases = purchaseWhereForInventory();

  const [purchaseAgg, byCounterparty, ventasAgg, pagosAgg, purchasesRecent] = await Promise.all([
    prisma.usdtPurchase.aggregate({
      where: wherePurchases,
      _sum: { usdtAmount: true, gtqTotal: true },
      _count: { _all: true },
    }),
    prisma.usdtPurchase.groupBy({
      by: ["counterparty"],
      where: wherePurchases,
      _count: { _all: true },
    }),
    prisma.otcOperation.aggregate({
      where: { side: OtcSide.CLIENT_BUYS_USDT },
      _sum: { usdtAmount: true },
    }),
    prisma.operatorMxnUsdtSettlement.aggregate({
      _sum: { usdtPaid: true },
    }),
    prisma.usdtPurchase.findMany({
      where: wherePurchases,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
      select: {
        id: true,
        dayKey: true,
        counterparty: true,
        operatorId: true,
        providerId: true,
        usdtAmount: true,
        gtqTotal: true,
        createdAt: true,
      },
    }),
  ]);

  const purchaseSumUsdt = d(purchaseAgg._sum.usdtAmount);
  const purchaseSumGtq = d(purchaseAgg._sum.gtqTotal);
  const totalPurchaseRows = purchaseAgg._count._all;

  let operatorPurchaseRows = 0;
  let providerPurchaseRows = 0;
  for (const g of byCounterparty) {
    const c = g.counterparty;
    if (c === PurchaseCounterparty.OPERATOR) operatorPurchaseRows = g._count._all;
    if (c === PurchaseCounterparty.PROVIDER_MX) providerPurchaseRows = g._count._all;
  }

  const ventasUsdtSubtotal = d(ventasAgg._sum.usdtAmount);
  const operatorMxnUsdtPaidSubtotal = d(pagosAgg._sum.usdtPaid);

  const inventarioFinalUsdt = purchaseSumUsdt - ventasUsdtSubtotal - operatorMxnUsdtPaidSubtotal;
  const avgGtqPerUsdt = purchaseSumUsdt > 0 ? purchaseSumGtq / purchaseSumUsdt : 0;
  const gtqBasis = inventarioFinalUsdt * avgGtqPerUsdt;

  const purchaseRowsRecent: InventoryPurchaseRowDebug[] = purchasesRecent.map((p) => ({
    id: p.id,
    dayKey: p.dayKey,
    counterparty: p.counterparty,
    operatorId: p.operatorId,
    providerId: p.providerId,
    usdt: d(p.usdtAmount),
    gtq: d(p.gtqTotal),
  }));

  return {
    usdt: inventarioFinalUsdt,
    gtqBasis,
    avgGtqPerUsdt,
    diagnostics: {
      totalPurchaseRows,
      operatorPurchaseRows,
      providerPurchaseRows,
      purchaseSumUsdt,
      purchaseSumGtq,
      ventasUsdtSubtotal,
      operatorMxnUsdtPaidSubtotal,
      inventarioFinalUsdt,
      purchaseRowsRecent,
    },
  };
}

export async function costForUsdtSale(usdtQty: number): Promise<{ avg: number; cogs: number; invUsdt: number }> {
  const { avgGtqPerUsdt, usdt } = await computeInventoryFromDb();
  return { avg: avgGtqPerUsdt, cogs: usdtQty * avgGtqPerUsdt, invUsdt: usdt };
}
