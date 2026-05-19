import { Prisma } from "@prisma/client";

/** Misma leyenda que al crear la liquidación (libro operador / backfill). */
export function buildOperatorMxnUsdtPayoutStatementLabel(row: {
  mxnReceived: Prisma.Decimal;
  xeReference: Prisma.Decimal;
  referenceUsdt: Prisma.Decimal;
  usdtPaid: Prisma.Decimal;
  diffUsdt: Prisma.Decimal;
  gtqRateOptional: Prisma.Decimal | null;
  notes?: string | null;
}): string {
  const gtqRateOptional = row.gtqRateOptional ?? undefined;
  return [
    "Operador MXN → pago USDT",
    `MXN ${row.mxnReceived.toFixed(2)} · XE ${row.xeReference.toFixed(4)} · ref USDT ${row.referenceUsdt.toFixed(4)} · pagado ${row.usdtPaid.toFixed(4)} · Δ ${row.diffUsdt.toFixed(4)}`,
    gtqRateOptional ? `Tasa ref. GTQ/USDT ${gtqRateOptional.toFixed(4)}` : null,
    row.notes?.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");
}
