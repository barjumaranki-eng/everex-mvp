/**
 * Verificación numérica obligatoria (sin DB): escenario Richie MXN→USDT con tasa GTQ/USDT.
 * Ejecutar: npm run verify:richie-om   (o: npx tsx scripts/verify-richie-om-scenario.ts)
 */
import { Prisma } from "@prisma/client";

function assertClose(label: string, actual: number, expected: number, eps: number) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > eps) {
    console.error(`FAIL ${label}: got ${actual}, expected ${expected} (eps ${eps})`);
    process.exit(1);
  }
}

const mxnReceived = new Prisma.Decimal("1738983");
const xeReference = new Prisma.Decimal("17.34");
const usdtPaid = new Prisma.Decimal("100000");
const gtqRateOptional = new Prisma.Decimal("7.6950");

const referenceUsdt = mxnReceived.div(xeReference);
const diffUsdt = referenceUsdt.sub(usdtPaid);
const gtqPaidEquivalent = usdtPaid.mul(gtqRateOptional);

const gtqPurchase = new Prisma.Decimal("769500");
const usdtPurchase = referenceUsdt;

const finalGtqBalance = Number(gtqPurchase.sub(gtqPaidEquivalent).toString());
const finalUsdtBalance = Number(usdtPurchase.sub(usdtPaid).toString());

assertClose("gtqPaidEquivalent", Number(gtqPaidEquivalent.toString()), 769_500, 1e-6);
assertClose("finalGtqBalance", finalGtqBalance, 0, 1e-6);
assertClose("diffUsdt vs reference−paid", Number(diffUsdt.toString()), Number(referenceUsdt.sub(usdtPaid).toString()), 1e-9);
assertClose("finalUsdtBalance vs diffUsdt", finalUsdtBalance, Number(diffUsdt.toString()), 1e-9);

// Coherencia con montos “de pantalla” (redondeo a 2 decimales típico en UI)
const ref2 = Number(referenceUsdt.toDecimalPlaces(2).toString());
const diff2 = Number(diffUsdt.toDecimalPlaces(2).toString());
assertClose("referenceUsdt UI 2dp", ref2, 100_287.37, 0.01);
assertClose("diffUsdt UI 2dp", diff2, 287.37, 0.01);

console.log("OK verify-richie-om-scenario", {
  referenceUsdt: referenceUsdt.toString(),
  diffUsdt: diffUsdt.toString(),
  gtqPaidEquivalent: gtqPaidEquivalent.toString(),
  finalGtqBalance,
  finalUsdtBalance,
});
