import type { DistributionDestination, ExpenseCategory, FiatCurrency } from "@prisma/client";
import { BankRowStatus, OtcSide, Prisma, PurchaseCounterparty, StatementLineStatus } from "@prisma/client";
import { allocationLinesGtqEquivalentSum } from "@/lib/otc-allocations-parse";
import { prisma } from "@/lib/prisma";
import { todayDayKey } from "@/lib/day-key";
import { monthBoundsDayKeys } from "@/lib/day-range";
import { getBankBalanceBreakdown } from "@/lib/bank-balance";
import { OTC_ALLOC_TOTAL_EPS } from "@/lib/otc-allocations-parse";
import { computeInventoryFromDb } from "@/lib/inventory";
import { prismaWhereCreatedInDayRange } from "@/lib/operative-datetime";

const RECENT_MESA_DAYS = 21;
/** Ventana para contar gastos/pagos/mov. sin soporte o referencia (solo conteos en dashboard operativo). */
export const OPERATIONAL_DASHBOARD_PROOF_DAYS = 90;

function needsRepartoGtq(op: {
  side: OtcSide;
  fiatCurrency: FiatCurrency;
  totalFiat: Prisma.Decimal;
  rateFiatPerUsdt: Prisma.Decimal;
  allocations: {
    amount: Prisma.Decimal;
    destination: DistributionDestination;
    currency: FiatCurrency;
  }[];
}): boolean {
  if (op.side !== OtcSide.CLIENT_BUYS_USDT || op.fiatCurrency !== "GTQ") return false;
  if (op.allocations.length === 0) return true;
  const sum = allocationLinesGtqEquivalentSum(op.allocations, op.rateFiatPerUsdt);
  return sum.sub(op.totalFiat).abs().gt(OTC_ALLOC_TOTAL_EPS);
}

const STMT_PENDING: StatementLineStatus[] = [
  StatementLineStatus.UNMATCHED,
  StatementLineStatus.POSSIBLE_MATCH,
  StatementLineStatus.DIFFERENCE,
];

const MOV_PENDING: BankRowStatus[] = [
  BankRowStatus.UNMATCHED,
  BankRowStatus.POSSIBLE_MATCH,
  BankRowStatus.DIFFERENCE,
];

export type OperationalDashboardSnapshot = {
  dayKey: string;
  /** Mesa reciente: acción sugerida sin montos. */
  operacionesPendientes: {
    id: string;
    ref: string;
    clientName: string;
    kind: "mesa";
    accion: "falta_reparto" | "ok";
  }[];
  ventasSinReparto: { id: string; ref: string; clientName: string }[];
  spreadReciente: { id: string; ref: string; clientName: string }[];
  bancosConciliar: {
    bankAccountId: string;
    label: string;
    lineasPendientes: number;
    movimientosPendientes: number;
  }[];
  pagosPendientes: { cuentasPorCobrar: number; deudasEverex: number };
  alertasDiferencia: { label: string }[];
  clientesDeudoresActivos: number;
  sinSoporte: {
    gastos: number;
    pagosCliente: number;
    pagosDeuda: number;
    movBancoSinReferencia: number;
  };
  /** Mismos totales que `computeInventoryFromDb` (compras `UsdtPurchase` + movimientos OTC, etc.). */
  inventoryUsdt: number;
  inventoryAvgGtqPerUsdt: number;
  /** Compras USDT del día atribuibles a operador: contraparte OPERATOR, o PROVIDER_MX con operador asociado. */
  purchasesOperatorTodayGtq: number;
  purchasesOperatorTodayUsdt: number;
  /** Compras USDT del día (proveedor MX, todas): inventario / flujo MX. */
  purchasesProviderMxTodayUsdt: number;
  gastos: {
    todayGtq: number;
    monthGtq: number;
    recent: {
      id: string;
      dayKey: string;
      category: ExpenseCategory;
      amount: number;
      currency: FiatCurrency;
      description: string;
      bankLabel: string | null;
      reference: string | null;
      userLabel: string;
    }[];
    bankSaldos: {
      bankAccountId: string;
      label: string;
      currency: FiatCurrency;
      systemBalance: number;
    }[];
  };
};

export async function loadOperationalDashboardSnapshot(): Promise<OperationalDashboardSnapshot> {
  const dayKey = todayDayKey();
  const { start: monthStart, end: monthEnd } = monthBoundsDayKeys();
  const sinceMesa = new Date();
  sinceMesa.setDate(sinceMesa.getDate() - RECENT_MESA_DAYS);
  const sinceProof = new Date();
  sinceProof.setDate(sinceProof.getDate() - OPERATIONAL_DASHBOARD_PROOF_DAYS);

  const [
    mesaReciente,
    spreads,
    bankAccounts,
    stmtGrouped,
    movGrouped,
    recvCount,
    payCount,
    gastosSin,
    recvPaySin,
    payPaySin,
    movSinRef,
    inv,
    purchasesOperatorToday,
    purchasesProviderMxToday,
    gastosTodayRows,
    gastosMonthRows,
    gastosRecent,
  ] = await Promise.all([
    prisma.otcOperation.findMany({
      where: { createdAt: { gte: sinceMesa } },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        ref: true,
        side: true,
        fiatCurrency: true,
        totalFiat: true,
        rateFiatPerUsdt: true,
        client: { select: { name: true } },
        allocations: {
          select: { amount: true, destination: true, currency: true },
        },
      },
    }),
    prisma.otcMxnSpread.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, ref: true, client: { select: { name: true } } },
    }),
    prisma.bankAccount.findMany({
      where: { active: true },
      orderBy: { label: "asc" },
      select: { id: true, label: true, currency: true },
    }),
    prisma.bankStatementLine.groupBy({
      by: ["bankAccountId"],
      where: { status: { in: STMT_PENDING } },
      _count: { _all: true },
    }),
    prisma.bankMovement.groupBy({
      by: ["bankAccountId"],
      where: { status: { in: MOV_PENDING } },
      _count: { _all: true },
    }),
    prisma.clientReceivable.count({ where: { active: true } }),
    prisma.everexPayable.count({ where: { active: true } }),
    prisma.expense.count({
      where: {
        AND: [{ createdAt: { gte: sinceProof } }, { OR: [{ proofImage: null }, { proofImage: "" }] }],
      },
    }),
    prisma.clientReceivablePayment.count({
      where: {
        AND: [{ createdAt: { gte: sinceProof } }, { OR: [{ proofImage: null }, { proofImage: "" }] }],
      },
    }),
    prisma.everexPayablePayment.count({
      where: {
        AND: [{ createdAt: { gte: sinceProof } }, { OR: [{ proofImage: null }, { proofImage: "" }] }],
      },
    }),
    prisma.bankMovement.count({
      where: {
        AND: [{ createdAt: { gte: sinceProof } }, { OR: [{ reference: null }, { reference: "" }] }],
      },
    }),
    computeInventoryFromDb(),
    prisma.usdtPurchase.findMany({
      where: {
        AND: [
          {
            OR: [
              { counterparty: PurchaseCounterparty.OPERATOR },
              {
                counterparty: PurchaseCounterparty.PROVIDER_MX,
                operatorId: { not: null },
              },
            ],
          },
          prismaWhereCreatedInDayRange(dayKey, dayKey),
        ],
      },
      select: { gtqTotal: true, usdtAmount: true },
    }),
    prisma.usdtPurchase.findMany({
      where: {
        AND: [{ counterparty: PurchaseCounterparty.PROVIDER_MX }, prismaWhereCreatedInDayRange(dayKey, dayKey)],
      },
      select: { usdtAmount: true },
    }),
    prisma.expense.findMany({
      where: { dayKey },
      select: { amount: true, currency: true },
    }),
    prisma.expense.findMany({
      where: { dayKey: { gte: monthStart, lte: monthEnd } },
      select: { amount: true, currency: true },
    }),
    prisma.expense.findMany({
      orderBy: { date: "desc" },
      take: 10,
      include: {
        createdBy: { select: { displayName: true, email: true } },
        bankAccount: { select: { label: true } },
        bankMovement: { select: { reference: true } },
      },
    }),
  ]);

  const stmtMap = new Map(stmtGrouped.map((g) => [g.bankAccountId, g._count._all]));
  const movMap = new Map(movGrouped.map((g) => [g.bankAccountId, g._count._all]));

  const alertasDiferencia: { label: string }[] = [];
  const bancosConciliar = bankAccounts.map((b) => {
    const lineasPendientes = stmtMap.get(b.id) ?? 0;
    const movimientosPendientes = movMap.get(b.id) ?? 0;
    return {
      bankAccountId: b.id,
      label: b.label,
      lineasPendientes,
      movimientosPendientes,
    };
  });

  const breakdowns = await Promise.all(
    bankAccounts.map((b) => getBankBalanceBreakdown(b.id, dayKey).then((br) => ({ label: b.label, br }))),
  );
  for (const { label, br } of breakdowns) {
    if (br.difference != null && Math.abs(br.difference) > 0.01) {
      alertasDiferencia.push({ label });
    }
  }

  const operacionesPendientes = mesaReciente.map((o) => {
    const reparto = needsRepartoGtq(o);
    return {
      id: o.id,
      ref: o.ref,
      clientName: o.client.name,
      kind: "mesa" as const,
      accion: reparto ? ("falta_reparto" as const) : ("ok" as const),
    };
  });

  const ventasSinReparto = mesaReciente
    .filter((o) => needsRepartoGtq(o))
    .map((o) => ({ id: o.id, ref: o.ref, clientName: o.client.name }));

  const spreadReciente = spreads.map((s) => ({
    id: s.id,
    ref: s.ref,
    clientName: s.client.name,
  }));

  let purchasesOperatorTodayGtq = 0;
  let purchasesOperatorTodayUsdt = 0;
  for (const p of purchasesOperatorToday) {
    purchasesOperatorTodayGtq += Number(p.gtqTotal.toString());
    purchasesOperatorTodayUsdt += Number(p.usdtAmount.toString());
  }
  let purchasesProviderMxTodayUsdt = 0;
  for (const p of purchasesProviderMxToday) {
    purchasesProviderMxTodayUsdt += Number(p.usdtAmount.toString());
  }

  const sumGtq = (rows: { amount: Prisma.Decimal; currency: FiatCurrency }[]) =>
    rows.filter((r) => r.currency === "GTQ").reduce((s, r) => s + Number(r.amount.toString()), 0);

  const gastosRecentMapped = gastosRecent.map((e) => ({
    id: e.id,
    dayKey: e.dayKey,
    category: e.category,
    amount: Number(e.amount.toString()),
    currency: e.currency,
    description: e.description,
    bankLabel: e.bankAccount?.label ?? null,
    reference: e.bankMovement?.reference?.trim() || e.description || null,
    userLabel: e.createdBy.displayName?.trim() || e.createdBy.email,
  }));

  const bankSaldos = bankAccounts.map((b, i) => ({
    bankAccountId: b.id,
    label: b.label,
    currency: b.currency,
    systemBalance: breakdowns[i]!.br.systemBalance,
  }));

  return {
    dayKey,
    operacionesPendientes,
    ventasSinReparto,
    spreadReciente,
    bancosConciliar,
    pagosPendientes: { cuentasPorCobrar: recvCount, deudasEverex: payCount },
    alertasDiferencia,
    clientesDeudoresActivos: recvCount,
    sinSoporte: {
      gastos: gastosSin,
      pagosCliente: recvPaySin,
      pagosDeuda: payPaySin,
      movBancoSinReferencia: movSinRef,
    },
    inventoryUsdt: inv.usdt,
    inventoryAvgGtqPerUsdt: inv.avgGtqPerUsdt,
    purchasesOperatorTodayGtq,
    purchasesOperatorTodayUsdt,
    purchasesProviderMxTodayUsdt,
    gastos: {
      todayGtq: sumGtq(gastosTodayRows),
      monthGtq: sumGtq(gastosMonthRows),
      recent: gastosRecentMapped,
      bankSaldos,
    },
  };
}
