import { FiatCurrency, OtcSide, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EST_GTQ_PER_USD } from "@/lib/fx";
import { isClientOtcAdvancePayable } from "@/lib/everex-payable-client-advance";
import { prismaWhereDayKeyInRange } from "@/lib/operative-datetime";

/** Solo se agrega a totales GTQ del “mini estado”; otras monedas se listan aparte. */
export function gtqOnlyAmount(amount: Prisma.Decimal, currency: FiatCurrency): number {
  if (currency !== FiatCurrency.GTQ) return 0;
  return Number(amount.toString());
}

export type FinancialSummary = {
  /** Suma de profitGtq en ventas OTC (utilidad contabilizada en GTQ). */
  otcGrossGtq: number;
  /** Suma de profitUsdt (liquidación MXN en USDT). */
  otcProfitUsdt: number;
  /** Suma de utilidad USDT en operaciones OTC MXN Spread. */
  mxnSpreadProfitUsdt: number;
  /** Bruta OTC en GTQ + utilidad USDT (mesa + spread) convertida con estimación fija (ver EST_GTQ_PER_USD). */
  otcGrossCombinedGtq: number;
  expensesGtq: number;
  debtPaymentsGtq: number;
  recoveriesGtq: number;
  netOperatingGtq: number;
  /** Flujo: recuperaciones no entran en fórmula de utilidad neta operativa; sí en caja. */
  cashDeltaGtq: number;
  pendingReceivablesGtq: number;
  /** Deudas Everex (excluye anticipos cliente por venta parcial). */
  pendingPayablesGtq: number;
  /** GTQ pendiente de liquidar en USDT (anticipo tras venta parcial). */
  pendingClientAdvancesGtq: number;
  nonGtqExpenseCount: number;
  nonGtqRecoveryCount: number;
};

export async function getFinancialSummary(startDay: string, endDay: string): Promise<FinancialSummary> {
  const [otcAgg, otcUsdtAgg, spreadAgg, expenses, debtPays, recvPays, recvOpen, payOpen] = await Promise.all([
    prisma.otcOperation.aggregate({
      where: {
        AND: [{ side: OtcSide.CLIENT_BUYS_USDT }, prismaWhereDayKeyInRange(startDay, endDay)],
      },
      _sum: { profitGtq: true },
    }),
    prisma.otcOperation.aggregate({
      where: {
        AND: [{ side: OtcSide.CLIENT_BUYS_USDT }, prismaWhereDayKeyInRange(startDay, endDay)],
      },
      _sum: { profitUsdt: true },
    }),
    prisma.otcMxnSpread.aggregate({
      where: prismaWhereDayKeyInRange(startDay, endDay),
      _sum: { profitUsdt: true },
    }),
    prisma.expense.findMany({
      where: prismaWhereDayKeyInRange(startDay, endDay),
      select: { amount: true, currency: true },
    }),
    prisma.everexPayablePayment.findMany({
      where: prismaWhereDayKeyInRange(startDay, endDay),
      select: { amount: true, currency: true },
    }),
    prisma.clientReceivablePayment.findMany({
      where: prismaWhereDayKeyInRange(startDay, endDay),
      select: { amount: true, currency: true },
    }),
    prisma.clientReceivable.findMany({
      where: { active: true },
      select: { balance: true, currency: true },
    }),
    prisma.everexPayable.findMany({
      where: { active: true },
      select: { balance: true, currency: true, creditorType: true, reason: true },
    }),
  ]);

  const otcGrossGtq = Number(otcAgg._sum.profitGtq?.toString() ?? "0");
  const otcProfitUsdt = Number(otcUsdtAgg._sum.profitUsdt?.toString() ?? "0");
  const mxnSpreadProfitUsdt = Number(spreadAgg._sum.profitUsdt?.toString() ?? "0");
  const otcGrossCombinedGtq =
    otcGrossGtq + (otcProfitUsdt + mxnSpreadProfitUsdt) * EST_GTQ_PER_USD;

  let expensesGtq = 0;
  let nonGtqExpenseCount = 0;
  for (const e of expenses) {
    if (e.currency === FiatCurrency.GTQ) {
      expensesGtq += Number(e.amount.toString());
    } else {
      nonGtqExpenseCount += 1;
    }
  }

  let debtPaymentsGtq = 0;
  for (const p of debtPays) {
    if (p.currency === FiatCurrency.GTQ) {
      debtPaymentsGtq += Number(p.amount.toString());
    }
  }

  let recoveriesGtq = 0;
  let nonGtqRecoveryCount = 0;
  for (const p of recvPays) {
    if (p.currency === FiatCurrency.GTQ) {
      recoveriesGtq += Number(p.amount.toString());
    } else {
      nonGtqRecoveryCount += 1;
    }
  }

  const netOperatingGtq = otcGrossCombinedGtq - expensesGtq - debtPaymentsGtq;
  const cashDeltaGtq = netOperatingGtq + recoveriesGtq;

  let pendingReceivablesGtq = 0;
  for (const r of recvOpen) {
    pendingReceivablesGtq += gtqOnlyAmount(r.balance, r.currency);
  }
  let pendingPayablesGtq = 0;
  let pendingClientAdvancesGtq = 0;
  for (const p of payOpen) {
    const gtq = gtqOnlyAmount(p.balance, p.currency);
    if (isClientOtcAdvancePayable(p)) pendingClientAdvancesGtq += gtq;
    else pendingPayablesGtq += gtq;
  }

  return {
    otcGrossGtq,
    otcProfitUsdt,
    mxnSpreadProfitUsdt,
    otcGrossCombinedGtq,
    expensesGtq,
    debtPaymentsGtq,
    recoveriesGtq,
    netOperatingGtq,
    cashDeltaGtq,
    pendingReceivablesGtq,
    pendingPayablesGtq,
    pendingClientAdvancesGtq,
    nonGtqExpenseCount,
    nonGtqRecoveryCount,
  };
}

export async function getTodayAndMonthSummary(todayKey: string) {
  const month = (() => {
    const [y, m] = todayKey.split("-").map(Number);
    const last = new Date(y, m, 0);
    const end = `${y}-${String(m).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    return { start, end };
  })();

  const [today, monthSum] = await Promise.all([
    getFinancialSummary(todayKey, todayKey),
    getFinancialSummary(month.start, month.end),
  ]);
  return { today, month: monthSum, monthRange: month };
}
