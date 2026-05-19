import {
  BankMovementType,
  DistributionDestination,
  FiatCurrency,
  Prisma,
  PurchaseCounterparty,
  StmtEntityKind,
  StmtEntryKind,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OPERATOR_MXN_USDT_SETTLEMENT_REF_TYPE } from "@/lib/operator-mxn-usdt-constants";
import { buildOperatorMxnUsdtPayoutStatementLabel } from "@/lib/operator-mxn-usdt-statement-label";
import { createStatementEntryCompat } from "@/lib/statement-entry-create-compat";

export type OperatorLedgerSummary = {
  stmtCount: number;
  purchaseCount: number;
  allocCount: number;
  payableCount: number;
  balanceGtq: Prisma.Decimal;
  hasLedger: boolean;
  canHardDelete: boolean;
};

/**
 * IDs de liquidaciones MXN→USDT del operador: solo filas `OperatorMxnUsdtSettlement` con este `operatorId`
 * (histórico completo; no se infiere desde `StatementEntry`).
 */
export async function collectOperatorMxnSettlementIdsForOperator(operatorId: string): Promise<string[]> {
  try {
    const byOp = await prisma.operatorMxnUsdtSettlement.findMany({ where: { operatorId }, select: { id: true } });
    return byOp.map((r) => r.id);
  } catch (e) {
    console.error("[operator-ledger] collectOperatorMxnSettlementIds by operatorId", operatorId, e);
    return [];
  }
}

/**
 * USDT salida histórica por liquidaciones MXN→USDT: suma `usdtPaid` de todas las filas
 * `OperatorMxnUsdtSettlement` con este `operatorId` (sin filtro de fecha).
 * Una sola fuente para no duplicar descuentos frente a asientos de libro.
 */
export async function sumOperatorMxnUsdtPaidOutForOperator(operatorId: string): Promise<Prisma.Decimal> {
  try {
    const agg = await prisma.operatorMxnUsdtSettlement.aggregate({
      where: { operatorId },
      _sum: { usdtPaid: true },
    });
    return agg._sum.usdtPaid ?? new Prisma.Decimal(0);
  } catch (e) {
    console.error("[operator-ledger] sum OM usdtPaid by operatorId", operatorId, e);
    return new Prisma.Decimal(0);
  }
}

/**
 * GTQ “salida” equivalente por liquidaciones MXN→USDT: SUM(`usdtPaid` × `gtqRateOptional`) solo cuando
 * `gtqRateOptional` no es null y es &gt; 0 (histórico completo, sin `StatementEntry`).
 */
export async function sumOperatorMxnGtqEquivalentPaidForOperator(operatorId: string): Promise<Prisma.Decimal> {
  try {
    const rows = await prisma.operatorMxnUsdtSettlement.findMany({
      where: { operatorId, gtqRateOptional: { not: null } },
      select: { usdtPaid: true, gtqRateOptional: true },
    });
    let total = new Prisma.Decimal(0);
    for (const r of rows) {
      if (r.gtqRateOptional == null) continue;
      if (r.gtqRateOptional.lte(0)) continue;
      total = total.add(r.usdtPaid.mul(r.gtqRateOptional));
    }
    return total;
  } catch (e) {
    console.error("[operator-ledger] sum OM GTQ equivalent by operatorId", operatorId, e);
    return new Prisma.Decimal(0);
  }
}

export type OperatorMxnSettlementMajorBookRow = {
  id: string;
  ref: string;
  mxnReceived: Prisma.Decimal;
  xeReference: Prisma.Decimal;
  referenceUsdt: Prisma.Decimal;
  usdtPaid: Prisma.Decimal;
  diffUsdt: Prisma.Decimal;
  gtqRateOptional: Prisma.Decimal | null;
  notes: string | null;
  createdAt: Date;
};

/** Liquidaciones MXN→USDT que deben verse en el libro del operador (mismo criterio que el saldo USDT). */
export async function loadOperatorMxnSettlementsForMajorBook(
  operatorId: string,
): Promise<OperatorMxnSettlementMajorBookRow[]> {
  try {
    return await prisma.operatorMxnUsdtSettlement.findMany({
      where: { operatorId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        ref: true,
        mxnReceived: true,
        xeReference: true,
        referenceUsdt: true,
        usdtPaid: true,
        diffUsdt: true,
        gtqRateOptional: true,
        notes: true,
        createdAt: true,
      },
    });
  } catch (e) {
    console.error("[operator-ledger] loadOperatorMxnSettlementsForMajorBook", operatorId, e);
    return [];
  }
}

export type SyncOperatorMxnUsdtLedgerResult = {
  examined: number;
  created: number;
  skipped: number;
  errors: string[];
};

/**
 * Por cada `OperatorMxnUsdtSettlement` sin `StatementEntry` OPERATOR_MXN_USDT_PAYOUT con el mismo `refId`,
 * crea el asiento (misma estructura que el alta en operaciones). No duplica. No modifica GTQ del asiento (0).
 */
export async function syncOperatorMxnUsdtSettlementsToOperatorLedger(): Promise<SyncOperatorMxnUsdtLedgerResult> {
  const result: SyncOperatorMxnUsdtLedgerResult = { examined: 0, created: 0, skipped: 0, errors: [] };

  let settlements: Awaited<ReturnType<typeof prisma.operatorMxnUsdtSettlement.findMany>>;
  try {
    settlements = await prisma.operatorMxnUsdtSettlement.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        ref: true,
        operatorId: true,
        providerId: true,
        mxnReceived: true,
        xeReference: true,
        referenceUsdt: true,
        usdtPaid: true,
        diffUsdt: true,
        gtqRateOptional: true,
        notes: true,
        dayKey: true,
        createdAt: true,
        createdByUserId: true,
      },
    });
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
    return result;
  }

  for (const row of settlements) {
    result.examined += 1;
    let existing = 0;
    try {
      existing = await prisma.statementEntry.count({
        where: {
          kind: StmtEntryKind.OPERATOR_MXN_USDT_PAYOUT,
          refType: OPERATOR_MXN_USDT_SETTLEMENT_REF_TYPE,
          refId: row.id,
        },
      });
    } catch (e) {
      result.errors.push(`${row.id}: no se pudo comprobar duplicados (${e instanceof Error ? e.message : String(e)})`);
      continue;
    }
    if (existing > 0) {
      result.skipped += 1;
      continue;
    }

    const label = buildOperatorMxnUsdtPayoutStatementLabel({
      mxnReceived: row.mxnReceived,
      xeReference: row.xeReference,
      referenceUsdt: row.referenceUsdt,
      usdtPaid: row.usdtPaid,
      diffUsdt: row.diffUsdt,
      gtqRateOptional: row.gtqRateOptional,
      notes: row.notes,
    });
    const postedAt = row.createdAt;

    const ok = await createStatementEntryCompat(
      prisma,
      {
        entityKind: StmtEntityKind.OPERATOR,
        operatorId: row.operatorId,
        clientId: null,
        providerId: null,
        amountGtq: new Prisma.Decimal(0),
        kind: StmtEntryKind.OPERATOR_MXN_USDT_PAYOUT,
        label,
        refType: OPERATOR_MXN_USDT_SETTLEMENT_REF_TYPE,
        refId: row.id,
        dayKey: row.dayKey,
        createdByUserId: row.createdByUserId,
      },
      postedAt,
    );
    if (ok) result.created += 1;
    else result.errors.push(`${row.id}: no se pudo crear asiento de libro (revisar columnas StatementEntry)`);
  }

  return result;
}

/**
 * Saldo GTQ operador desde movimientos operacionales (misma base que el libro mayor parcial).
 *
 * **Compras USDT:** filas `UsdtPurchase` con este `operatorId`, `usdtAmount > 0` y contraparte
 * `OPERATOR` o `PROVIDER_MX` (compra vía proveedor MX con operador asociado suma igual al operador).
 *
 * **Liquidación MXN→USDT:** si la fila trae `gtqRateOptional`, resta `usdtPaid × gtqRateOptional` del saldo GTQ
 * (pago de deuda al operador liquidado en USDT a tipo pactado). Sin tasa no se ajusta GTQ aquí.
 */
export async function computeOperatorGtqBalanceFromOperationalSources(operatorId: string): Promise<Prisma.Decimal> {
  let sum = new Prisma.Decimal(0);

  try {
    const purchases = await prisma.usdtPurchase.findMany({
      where: {
        operatorId,
        usdtAmount: { gt: 0 },
        counterparty: { in: [PurchaseCounterparty.OPERATOR, PurchaseCounterparty.PROVIDER_MX] },
      },
      select: { gtqTotal: true },
    });
    for (const p of purchases) sum = sum.add(p.gtqTotal);
  } catch {
    /* omitir */
  }

  try {
    const allocs = await prisma.otcAllocation.findMany({
      where: {
        operatorId,
        destination: DistributionDestination.OPERATOR,
        currency: FiatCurrency.GTQ,
      },
      select: { amount: true },
    });
    for (const a of allocs) sum = sum.sub(a.amount);
  } catch {
    /* omitir */
  }

  try {
    const op = await prisma.operator.findUnique({ where: { id: operatorId }, select: { name: true } });
    if (op?.name) {
      const needle = `Pago operador ${op.name}`;
      const banks = await prisma.bankMovement.findMany({
        where: {
          type: BankMovementType.DEBIT,
          currency: FiatCurrency.GTQ,
          description: { contains: needle },
        },
        select: { amount: true },
      });
      for (const b of banks) sum = sum.sub(b.amount);
    }
  } catch {
    /* omitir */
  }

  try {
    const omGtq = await sumOperatorMxnGtqEquivalentPaidForOperator(operatorId);
    sum = sum.sub(omGtq);
  } catch {
    /* omitir */
  }

  return sum;
}

export type OperatorBalance = {
  /**
   * Histórico completo GTQ: compras operador − reparto cliente GTQ − pagos banco Everex
   * − liquidaciones MXN→USDT con tasa (`usdtPaid` × `gtqRateOptional`) + ajustes manuales en asientos.
   */
  balanceGtq: Prisma.Decimal;
  /**
   * USDT histórico: SUM(`UsdtPurchase.usdtAmount`) + SUM(`OtcAllocation.amount` en USDT al operador)
   * − SUM(`OperatorMxnUsdtSettlement.usdtPaid`). Sin filtro de fecha ni `dayKey`.
   */
  balanceUsdt: number;
};

async function sumPurchaseUsdtForOperator(operatorId: string): Promise<Prisma.Decimal> {
  try {
    const agg = await prisma.usdtPurchase.aggregate({
      where: {
        operatorId,
        usdtAmount: { gt: 0 },
        counterparty: { in: [PurchaseCounterparty.OPERATOR, PurchaseCounterparty.PROVIDER_MX] },
      },
      _sum: { usdtAmount: true },
    });
    return agg._sum.usdtAmount ?? new Prisma.Decimal(0);
  } catch {
    return new Prisma.Decimal(0);
  }
}

async function sumOtcUsdtAllocationsToOperator(operatorId: string): Promise<Prisma.Decimal> {
  try {
    const agg = await prisma.otcAllocation.aggregate({
      where: {
        operatorId,
        destination: DistributionDestination.OPERATOR,
        currency: FiatCurrency.USDT,
      },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? new Prisma.Decimal(0);
  } catch {
    return new Prisma.Decimal(0);
  }
}

async function getOperatorUsdtLedgerPartsInternal(operatorId: string): Promise<{
  purchaseUsdt: Prisma.Decimal;
  otcAllocUsdt: Prisma.Decimal;
  mxnUsdtPaidOut: Prisma.Decimal;
}> {
  const [purchaseUsdt, otcAllocUsdt, mxnUsdtPaidOut] = await Promise.all([
    sumPurchaseUsdtForOperator(operatorId),
    sumOtcUsdtAllocationsToOperator(operatorId),
    sumOperatorMxnUsdtPaidOutForOperator(operatorId),
  ]);
  return { purchaseUsdt, otcAllocUsdt, mxnUsdtPaidOut };
}

/**
 * Saldo operador: GTQ desde compras/reparto/banco/liquidaciones MXN→USDT con `gtqRateOptional`/ajustes.
 * USDT = compras (`UsdtPurchase.usdtAmount`, OPERATOR o PROVIDER_MX, `usdtAmount` &gt; 0)
 * + reparto OTC al operador en USDT (`OtcAllocation`, destino OPERATOR, moneda USDT)
 * − liquidaciones MXN→USDT (`OperatorMxnUsdtSettlement.usdtPaid`). Todo el histórico.
 */
export async function getOperatorBalancesFromDb(operatorId: string): Promise<OperatorBalance> {
  const gtqOp = await computeOperatorGtqBalanceFromOperationalSources(operatorId);
  let manualGtq = new Prisma.Decimal(0);
  try {
    const agg = await prisma.statementEntry.aggregate({
      where: {
        entityKind: StmtEntityKind.OPERATOR,
        operatorId,
        kind: StmtEntryKind.MANUAL_ADJUST,
      },
      _sum: { amountGtq: true },
    });
    manualGtq = agg._sum.amountGtq ?? new Prisma.Decimal(0);
  } catch {
    manualGtq = new Prisma.Decimal(0);
  }
  const balanceGtq = gtqOp.add(manualGtq);

  const { purchaseUsdt, otcAllocUsdt, mxnUsdtPaidOut } = await getOperatorUsdtLedgerPartsInternal(operatorId);
  const balanceUsdt = purchaseUsdt.add(otcAllocUsdt).sub(mxnUsdtPaidOut);

  return { balanceGtq, balanceUsdt: Number(balanceUsdt.toString()) };
}

/** Diagnóstico temporal (admin): mismos términos que `getOperatorBalancesFromDb` para USDT. */
export type OperatorUsdtBalanceDebugRow = {
  operatorId: string;
  name: string;
  purchasesUsdt: number;
  otcAllocUsdt: number;
  mxnUsdtPaidOut: number;
  finalUsdtBalance: number;
};

export async function loadOperatorUsdtBalanceDebugForAdmin(): Promise<OperatorUsdtBalanceDebugRow[]> {
  let operators: { id: string; name: string }[] = [];
  try {
    operators = await prisma.operator.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  } catch {
    return [];
  }
  const out: OperatorUsdtBalanceDebugRow[] = [];
  for (const o of operators) {
    const { purchaseUsdt, otcAllocUsdt, mxnUsdtPaidOut } = await getOperatorUsdtLedgerPartsInternal(o.id);
    const finalUsdtBalance = Number(purchaseUsdt.add(otcAllocUsdt).sub(mxnUsdtPaidOut).toString());
    out.push({
      operatorId: o.id,
      name: o.name,
      purchasesUsdt: Number(purchaseUsdt.toString()),
      otcAllocUsdt: Number(otcAllocUsdt.toString()),
      mxnUsdtPaidOut: Number(mxnUsdtPaidOut.toString()),
      finalUsdtBalance,
    });
  }
  return out;
}

/** @deprecated Use getOperatorBalancesFromDb (misma implementación). */
export const getOperatorBalance = getOperatorBalancesFromDb;

export type OperatorBalanceRow = {
  id: string;
  name: string;
  balanceGtq: Prisma.Decimal;
  balanceUsdt: number;
};

export async function loadOperatorBalanceRowsForDashboard(): Promise<OperatorBalanceRow[]> {
  let operators: { id: string; name: string }[] = [];
  try {
    operators = await prisma.operator.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  } catch {
    return [];
  }
  const rows = await Promise.all(
    operators.map(async (o) => {
      const b = await getOperatorBalance(o.id);
      return { id: o.id, name: o.name, balanceGtq: b.balanceGtq, balanceUsdt: b.balanceUsdt };
    }),
  );
  return rows;
}

export async function getOperatorLedgerSummary(operatorId: string): Promise<OperatorLedgerSummary> {
  let stmtCount = 0;
  let purchaseCount = 0;
  let allocCount = 0;
  let payableCount = 0;

  try {
    stmtCount = await prisma.statementEntry.count({ where: { operatorId } });
  } catch {
    stmtCount = 0;
  }

  try {
    purchaseCount = await prisma.usdtPurchase.count({
      where: {
        operatorId,
        counterparty: { in: [PurchaseCounterparty.OPERATOR, PurchaseCounterparty.PROVIDER_MX] },
      },
    });
  } catch {
    purchaseCount = 0;
  }

  try {
    allocCount = await prisma.otcAllocation.count({ where: { operatorId } });
  } catch {
    allocCount = 0;
  }

  try {
    payableCount = await prisma.everexPayable.count({ where: { operatorId } });
  } catch {
    payableCount = 0;
  }

  const { balanceGtq } = await getOperatorBalance(operatorId);

  const hasLedger = stmtCount + purchaseCount + allocCount + payableCount > 0;
  const balanceNonZero = !balanceGtq.equals(0) && !balanceGtq.abs().lessThan(new Prisma.Decimal("0.0001"));
  const canHardDelete = !hasLedger && !balanceNonZero;
  return {
    stmtCount,
    purchaseCount,
    allocCount,
    payableCount,
    balanceGtq,
    hasLedger,
    canHardDelete,
  };
}
