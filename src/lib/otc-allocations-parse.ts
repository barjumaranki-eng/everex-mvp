import type { DistributionDestination, FiatCurrency } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { normalizeMoneyBackend } from "@/lib/format-money";

const DISTRIBUTION_DESTINATIONS = new Set<string>(["OPERATOR", "EVEREX_BANK", "CASH"]);
const FIAT_CURRENCIES = new Set<string>(["GTQ", "MXN", "USD", "USDT"]);

export type OtcAllocFormInput = {
  destination: DistributionDestination;
  operatorId?: string;
  bankAccountId?: string;
  amount: Prisma.Decimal;
  currency: FiatCurrency;
  reference?: string;
  notes?: string;
};

export const OTC_ALLOC_TOTAL_EPS = new Prisma.Decimal("0.01");

function dec(s: string): Prisma.Decimal {
  const n = normalizeMoneyBackend(s);
  if (n === "" || Number.isNaN(Number(n))) throw new Error("Monto inválido en reparto");
  return new Prisma.Decimal(n);
}

/** Suma en GTQ equivalente: líneas operador en USDT se valorizan con la tasa de la operación. */
export function sumAllocationsGtqEquivalent(
  allocs: OtcAllocFormInput[],
  rateFiatPerUsdt: Prisma.Decimal,
): Prisma.Decimal {
  return allocs.reduce((acc, a) => {
    if (a.destination === "OPERATOR" && a.currency === "USDT") {
      return acc.add(a.amount.mul(rateFiatPerUsdt));
    }
    return acc.add(a.amount);
  }, new Prisma.Decimal(0));
}

/** Misma lógica con filas persistidas (reparto ya guardado). */
export function allocationLinesGtqEquivalentSum(
  allocs: {
    amount: Prisma.Decimal;
    destination: DistributionDestination;
    currency: FiatCurrency;
  }[],
  rateFiatPerUsdt: Prisma.Decimal,
): Prisma.Decimal {
  return allocs.reduce((acc, a) => {
    if (a.destination === "OPERATOR" && a.currency === "USDT") {
      return acc.add(a.amount.mul(rateFiatPerUsdt));
    }
    return acc.add(a.amount);
  }, new Prisma.Decimal(0));
}

export function sumOperatorUsdtPayoutTotal(allocs: OtcAllocFormInput[]): Prisma.Decimal {
  return allocs.reduce((acc, a) => {
    if (a.destination === "OPERATOR" && a.currency === "USDT") {
      return acc.add(a.amount);
    }
    return acc;
  }, new Prisma.Decimal(0));
}

/** Índices presentes en el FormData (alloc_{i}_*). */
export function collectOtcAllocIndices(formData: FormData): number[] {
  const s = new Set<number>();
  for (const key of formData.keys()) {
    const m = /^alloc_(\d+)_dest$/.exec(key);
    if (m) s.add(Number(m[1]));
  }
  return [...s].sort((a, b) => a - b);
}

/**
 * Parsea líneas de reparto. Omite filas totalmente vacías.
 * Filas parciales (solo destino o solo monto) → error.
 */
export function parseOtcAllocationsFromFormData(formData: FormData): OtcAllocFormInput[] {
  const indices = collectOtcAllocIndices(formData);
  const out: OtcAllocFormInput[] = [];
  let lineNo = 0;

  for (const i of indices) {
    lineNo++;
    const dest = String(formData.get(`alloc_${i}_dest`) ?? "").trim();
    const amountRaw = String(formData.get(`alloc_${i}_amount`) ?? "").trim();
    const cur = String(formData.get(`alloc_${i}_currency`) ?? "GTQ") as FiatCurrency;

    if (!dest && !amountRaw) continue;
    if (!dest) throw new Error(`Reparto línea ${lineNo}: elija destino (operador, banco o cash).`);
    if (!amountRaw) throw new Error(`Reparto línea ${lineNo}: indique el monto.`);

    if (!DISTRIBUTION_DESTINATIONS.has(dest)) {
      throw new Error(`Reparto línea ${lineNo}: destino inválido.`);
    }
    if (!FIAT_CURRENCIES.has(cur)) throw new Error(`Reparto línea ${lineNo}: moneda inválida.`);

    const amount = dec(amountRaw);
    const operatorId = String(formData.get(`alloc_${i}_operatorId`) ?? "").trim() || undefined;
    const bankAccountId = String(formData.get(`alloc_${i}_bankAccountId`) ?? "").trim() || undefined;
    const reference = String(formData.get(`alloc_${i}_ref`) ?? "").trim() || undefined;
    const notes = String(formData.get(`alloc_${i}_notes`) ?? "").trim() || undefined;

    if (dest === "OPERATOR" && cur !== "GTQ" && cur !== "USDT") {
      throw new Error(`Reparto línea ${lineNo}: reparto a operador solo en GTQ o USDT.`);
    }

    if (dest === "OPERATOR" && !operatorId) throw new Error(`Reparto línea ${lineNo}: seleccione operador.`);
    if (dest === "EVEREX_BANK" && !bankAccountId) throw new Error(`Reparto línea ${lineNo}: seleccione cuenta bancaria.`);
    if (dest !== "OPERATOR" && cur === "USDT") {
      throw new Error(`Reparto línea ${lineNo}: USDT solo aplica si el destino es operador.`);
    }

    out.push({
      destination: dest as DistributionDestination,
      operatorId,
      bankAccountId,
      amount,
      currency: cur,
      reference,
      notes,
    });
  }

  return out;
}

export function sumAllocationsGtq(allocs: OtcAllocFormInput[]): Prisma.Decimal {
  return allocs.reduce((acc, a) => acc.add(a.amount), new Prisma.Decimal(0));
}

export function allocationsMatchTotalFiat(
  allocs: OtcAllocFormInput[],
  totalFiat: Prisma.Decimal,
  rateFiatPerUsdt: Prisma.Decimal,
): boolean {
  return sumAllocationsGtqEquivalent(allocs, rateFiatPerUsdt).sub(totalFiat).abs().lte(OTC_ALLOC_TOTAL_EPS);
}
