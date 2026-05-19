/** Estimación solo para mostrar utilidad en USD en dashboard (no contabilidad formal). */
export const EST_GTQ_PER_USD = 7.85;

export function gtqToUsdEstimate(gtq: number): number {
  if (!Number.isFinite(gtq) || EST_GTQ_PER_USD <= 0) return 0;
  return gtq / EST_GTQ_PER_USD;
}

/** Utilidad u otro monto en GTQ → equivalente USDT/USD de referencia (1 USDT ≈ 1 USD a esta tasa). */
export function gtqToUsdtEquiv(gtq: number): number {
  return gtqToUsdEstimate(gtq);
}
