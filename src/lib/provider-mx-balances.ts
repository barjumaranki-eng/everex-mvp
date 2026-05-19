import { Prisma, PurchaseCounterparty } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const purchaseWhere = (providerId: string) => ({
  providerId,
  counterparty: PurchaseCounterparty.PROVIDER_MX,
  usdtAmount: { gt: 0 },
});

/**
 * Acumulado proveedor MX desde `UsdtPurchase` con **`counterparty = PROVIDER_MX`** y este `providerId`.
 * Suma MXN / GTQ / USDT al proveedor. Si la fila tiene `operatorId`, esos mismos montos también alimentan el libro del operador (no se restan aquí).
 */
export async function getProviderMxBalancesFromDb(providerId: string): Promise<{
  sumMxn: Prisma.Decimal;
  sumGtq: Prisma.Decimal;
  sumUsdt: Prisma.Decimal;
}> {
  const agg = await prisma.usdtPurchase.aggregate({
    where: purchaseWhere(providerId),
    _sum: { amountMxn: true, gtqTotal: true, usdtAmount: true },
  });
  return {
    sumMxn: agg._sum.amountMxn ?? new Prisma.Decimal(0),
    sumGtq: agg._sum.gtqTotal ?? new Prisma.Decimal(0),
    sumUsdt: agg._sum.usdtAmount ?? new Prisma.Decimal(0),
  };
}

export type ProviderMxBalanceRow = {
  id: string;
  name: string;
  sumMxn: Prisma.Decimal;
  sumGtq: Prisma.Decimal;
  sumUsdt: Prisma.Decimal;
};

export async function loadProviderMxBalanceRowsFromDb(): Promise<ProviderMxBalanceRow[]> {
  const providers = await prisma.mexicoProvider.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return Promise.all(
    providers.map(async (p) => {
      const b = await getProviderMxBalancesFromDb(p.id);
      return { id: p.id, name: p.name, ...b };
    }),
  );
}
