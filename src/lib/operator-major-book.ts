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
import { monthBoundsDayKeys, weekBoundsDayKeys } from "@/lib/day-range";
import { parseDayEndExclusiveLocal, parseDayStartLocal, escapeCsvField } from "@/lib/operator-statement-dates";
import { formatMoneyDisplay } from "@/lib/format-money";
import { formatRateDisplay } from "@/lib/format-rate";
import { OPERATOR_MXN_USDT_SETTLEMENT_REF_TYPE } from "@/lib/operator-mxn-usdt-constants";
import { getOperatorBalance, loadOperatorMxnSettlementsForMajorBook } from "@/lib/operator-ledger";

export type MajorBookDisplayType =
  | "COMPRA_USDT_OPERADOR"
  | "COMPRA_USDT_PROV_MX_ASOC"
  | "PAGO_CLIENTE_A_OPERADOR"
  | "PAGO_EVEREX_A_OPERADOR"
  | "PAGO_OTC_OPERADOR_USDT"
  | "OPERADOR_MXN_USDT"
  | "AJUSTE_MANUAL";

export type MajorBookRow = {
  id: string;
  /** Fecha efectiva para orden / periodo (postedAt del libro o createdAt del registro). */
  postedAt: Date;
  systemCreatedAt: Date;
  displayType: MajorBookDisplayType;
  reference: string;
  description: string;
  mxn: Prisma.Decimal | null;
  rateMxnGtq: Prisma.Decimal | null;
  gtqDebit: Prisma.Decimal | null;
  gtqCredit: Prisma.Decimal | null;
  usdt: Prisma.Decimal | null;
  usdtEntry: Prisma.Decimal | null;
  usdtExit: Prisma.Decimal | null;
  clientName: string | null;
  operationRef: string | null;
  bankHint: string | null;
  userLabel: string;
  amountGtq: Prisma.Decimal;
  periodRunningGtq: number;
  periodRunningUsdt: number;
};

export type OperatorMajorBook = {
  /** Libro reconstruido desde compras, reparto OTC operador, liquidaciones MXN→USDT (`usdtPaid`, GTQ con `gtqRateOptional`), pagos banco y ajustes manuales (saldos desde tablas operativas, no StatementEntry). */
  partialLedger: boolean;
  periodLabel: string;
  periodStart: Date;
  periodEndExclusive: Date;
  openingBalanceGtq: number;
  closingBalanceGtq: number;
  currentBalanceGtq: number;
  openingBalanceUsdt: number;
  closingBalanceUsdt: number;
  currentBalanceUsdt: number;
  periodTotalMxnPurchases: number;
  periodTotalGtqPurchases: number;
  periodTotalUsdtPurchases: number;
  periodTotalClientPaymentsGtq: number;
  periodTotalEverexPaymentsGtq: number;
  periodTotalDebitsGtq: number;
  periodTotalCreditsGtq: number;
  periodTotalPaymentsAppliedGtq: number;
  periodTotalUsdtEntry: number;
  periodTotalUsdtExit: number;
  rows: MajorBookRow[];
};

export function parseOperatorLedgerRange(sp: Record<string, string | string[] | undefined>): {
  periodLabel: string;
  start: Date;
  endExclusive: Date;
} {
  const modeRaw = typeof sp.range === "string" ? sp.range : "month";
  const mode =
    modeRaw === "today" ||
    modeRaw === "day" ||
    modeRaw === "week" ||
    modeRaw === "month" ||
    modeRaw === "year" ||
    modeRaw === "custom"
      ? modeRaw
      : "month";
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  if (mode === "today" || mode === "day") {
    const d = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : todayKey;
    return {
      periodLabel: `Día ${d}`,
      start: parseDayStartLocal(d)!,
      endExclusive: parseDayEndExclusiveLocal(d)!,
    };
  }
  if (mode === "week") {
    const w = weekBoundsDayKeys(now);
    return {
      periodLabel: `Semana ${w.start} → ${w.end}`,
      start: parseDayStartLocal(w.start)!,
      endExclusive: parseDayEndExclusiveLocal(w.end)!,
    };
  }
  if (mode === "year") {
    const y =
      typeof sp.year === "string" && /^\d{4}$/.test(sp.year) ? parseInt(sp.year, 10) : now.getFullYear();
    return {
      periodLabel: `Año ${y}`,
      start: new Date(y, 0, 1, 0, 0, 0, 0),
      endExclusive: new Date(y + 1, 0, 1, 0, 0, 0, 0),
    };
  }
  if (mode === "custom") {
    const m = monthBoundsDayKeys(now);
    const from = typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : m.start;
    const to = typeof sp.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : m.end;
    return {
      periodLabel: `${from} → ${to}`,
      start: parseDayStartLocal(from)!,
      endExclusive: parseDayEndExclusiveLocal(to)!,
    };
  }
  const m = monthBoundsDayKeys(now);
  return {
    periodLabel: `Mes ${m.start.slice(0, 7)}`,
    start: parseDayStartLocal(m.start)!,
    endExclusive: parseDayEndExclusiveLocal(m.end)!,
  };
}

export const MAJOR_BOOK_TYPE_LABEL_ES: Record<MajorBookDisplayType, string> = {
  COMPRA_USDT_OPERADOR: "Compra USDT al operador",
  COMPRA_USDT_PROV_MX_ASOC: "Compra USDT (proveedor MX, operador asociado)",
  PAGO_CLIENTE_A_OPERADOR: "Pago cliente a operador",
  PAGO_EVEREX_A_OPERADOR: "Pago Everex a operador",
  PAGO_OTC_OPERADOR_USDT: "Pago operador USDT (OTC)",
  OPERADOR_MXN_USDT: "OPERADOR_MXN_USDT (MXN→USDT)",
  AJUSTE_MANUAL: "Ajuste manual",
};

export function parseBankHintFromLabel(label: string): string | null {
  const s = String(label ?? "").trim();
  const patterns = [/\bBanco\s*:\s*([^\n|]+)/i, /\|\s*Banco\s*:\s*([^\n|]+)/i, /;\s*Banco\s*:\s*([^\n]+)/i];
  for (const re of patterns) {
    const m = re.exec(s);
    if (m?.[1]) {
      const t = m[1]!.trim();
      return t.length ? t : null;
    }
  }
  return null;
}

function n(d: Prisma.Decimal): number {
  return Number(d.toString());
}

/** Net USDT delta for one operator statement entry (dashboard; no usado en libro operador parcial). */
export function statementEntryUsdtSignedDelta(
  e: { kind: StmtEntryKind; refType: string | null; refId: string | null },
  purchaseMap: Map<string, { usdtAmount: Prisma.Decimal }>,
  allocMap: Map<string, { amount: Prisma.Decimal; currency: FiatCurrency }>,
  operatorMxnMap: Map<string, { usdtPaid: Prisma.Decimal }>,
): number {
  if (e.refType === "UsdtPurchase" && e.refId) {
    const p = purchaseMap.get(e.refId);
    return p ? n(p.usdtAmount) : 0;
  }
  if (e.kind === StmtEntryKind.PAGO_OPERADOR_USDT && e.refType === "OtcAllocation" && e.refId) {
    const a = allocMap.get(e.refId);
    if (a?.currency === FiatCurrency.USDT) return n(a.amount);
  }
  if (
    e.kind === StmtEntryKind.OPERATOR_MXN_USDT_PAYOUT &&
    e.refType === OPERATOR_MXN_USDT_SETTLEMENT_REF_TYPE &&
    e.refId
  ) {
    const row = operatorMxnMap.get(e.refId);
    return row ? -n(row.usdtPaid) : 0;
  }
  return 0;
}

type SortableSourceRow = {
  sortKey: string;
  sortAt: Date;
  systemCreatedAt: Date;
  displayType: MajorBookDisplayType;
  reference: string;
  description: string;
  amountGtq: Prisma.Decimal;
  usdtSigned: number;
  mxn: Prisma.Decimal | null;
  rateMxnGtq: Prisma.Decimal | null;
  usdt: Prisma.Decimal | null;
  clientName: string | null;
  operationRef: string | null;
  bankHint: string | null;
  userLabel: string;
};

export async function buildOperatorMajorBook(
  operatorId: string,
  periodStart: Date,
  periodEndExclusive: Date,
  periodLabel: string,
): Promise<OperatorMajorBook> {
  const partialLedger = true;

  let operatorName = "";
  try {
    const op = await prisma.operator.findUnique({ where: { id: operatorId }, select: { name: true } });
    operatorName = op?.name ?? "";
  } catch {
    operatorName = "";
  }

  const sources: SortableSourceRow[] = [];

  try {
    const purchases = await prisma.usdtPurchase.findMany({
      where: {
        operatorId,
        usdtAmount: { gt: 0 },
        counterparty: { in: [PurchaseCounterparty.OPERATOR, PurchaseCounterparty.PROVIDER_MX] },
      },
      select: {
        id: true,
        counterparty: true,
        gtqTotal: true,
        usdtAmount: true,
        amountMxn: true,
        rateMxnToGtq: true,
        rateXe: true,
        notes: true,
        createdAt: true,
      },
    });
    for (const p of purchases) {
      const sortAt = p.createdAt;
      const desc = String(p.notes ?? "").trim() || "Compra USDT";
      const isProvMx = p.counterparty === PurchaseCounterparty.PROVIDER_MX;
      sources.push({
        sortKey: `p:${p.id}`,
        sortAt,
        systemCreatedAt: p.createdAt,
        displayType: isProvMx ? "COMPRA_USDT_PROV_MX_ASOC" : "COMPRA_USDT_OPERADOR",
        reference: `COMPRA_USDT · ${p.id}`,
        description: desc,
        amountGtq: p.gtqTotal,
        usdtSigned: n(p.usdtAmount),
        mxn: p.amountMxn,
        rateMxnGtq: p.rateMxnToGtq,
        usdt: p.usdtAmount,
        clientName: null,
        operationRef: null,
        bankHint: null,
        userLabel: "—",
      });
    }
  } catch {
    /* fuente omitida */
  }

  try {
    const allocs = await prisma.otcAllocation.findMany({
      where: { operatorId, destination: DistributionDestination.OPERATOR },
      select: {
        id: true,
        amount: true,
        currency: true,
        notes: true,
        reference: true,
        createdAt: true,
        operation: { select: { ref: true, client: { select: { name: true } } } },
      },
    });
    for (const a of allocs) {
      const sortAt = a.createdAt;
      if (a.currency === FiatCurrency.GTQ) {
        const amountGtq = a.amount.mul(new Prisma.Decimal(-1));
        const desc =
          String(a.notes ?? "").trim() || String(a.reference ?? "").trim() || "Pago cliente aplicado operador";
        sources.push({
          sortKey: `a:${a.id}`,
          sortAt,
          systemCreatedAt: a.createdAt,
          displayType: "PAGO_CLIENTE_A_OPERADOR",
          reference: `OtcAllocation · ${a.id.length > 14 ? `${a.id.slice(0, 14)}…` : a.id}`,
          description: desc,
          amountGtq,
          usdtSigned: 0,
          mxn: null,
          rateMxnGtq: null,
          usdt: null,
          clientName: a.operation.client?.name ?? null,
          operationRef: a.operation.ref ?? null,
          bankHint: null,
          userLabel: "—",
        });
      } else if (a.currency === FiatCurrency.USDT) {
        const desc =
          String(a.notes ?? "").trim() || String(a.reference ?? "").trim() || "Pago operador USDT (OTC)";
        sources.push({
          sortKey: `a:${a.id}:usdt`,
          sortAt,
          systemCreatedAt: a.createdAt,
          displayType: "PAGO_OTC_OPERADOR_USDT",
          reference: `OtcAllocation · ${a.id.length > 14 ? `${a.id.slice(0, 14)}…` : a.id}`,
          description: desc,
          amountGtq: new Prisma.Decimal(0),
          usdtSigned: n(a.amount),
          mxn: null,
          rateMxnGtq: null,
          usdt: a.amount,
          clientName: a.operation.client?.name ?? null,
          operationRef: a.operation.ref ?? null,
          bankHint: null,
          userLabel: "—",
        });
      }
    }
  } catch {
    try {
      const allocsBare = await prisma.otcAllocation.findMany({
        where: { operatorId, destination: DistributionDestination.OPERATOR },
        select: {
          id: true,
          amount: true,
          currency: true,
          notes: true,
          reference: true,
          createdAt: true,
          operationId: true,
        },
      });
      for (const a of allocsBare) {
        const sortAt = a.createdAt;
        if (a.currency === FiatCurrency.GTQ) {
          const amountGtq = a.amount.mul(new Prisma.Decimal(-1));
          const desc =
            String(a.notes ?? "").trim() || String(a.reference ?? "").trim() || "Pago cliente aplicado operador";
          sources.push({
            sortKey: `a:${a.id}`,
            sortAt,
            systemCreatedAt: a.createdAt,
            displayType: "PAGO_CLIENTE_A_OPERADOR",
            reference: `OtcAllocation · ${a.operationId.length > 14 ? `${a.operationId.slice(0, 14)}…` : a.operationId}`,
            description: desc,
            amountGtq,
            usdtSigned: 0,
            mxn: null,
            rateMxnGtq: null,
            usdt: null,
            clientName: null,
            operationRef: null,
            bankHint: null,
            userLabel: "—",
          });
        } else if (a.currency === FiatCurrency.USDT) {
          const desc =
            String(a.notes ?? "").trim() || String(a.reference ?? "").trim() || "Pago operador USDT (OTC)";
          sources.push({
            sortKey: `a:${a.id}:usdt`,
            sortAt,
            systemCreatedAt: a.createdAt,
            displayType: "PAGO_OTC_OPERADOR_USDT",
            reference: `OtcAllocation · ${a.id.length > 14 ? `${a.id.slice(0, 14)}…` : a.id}`,
            description: desc,
            amountGtq: new Prisma.Decimal(0),
            usdtSigned: n(a.amount),
            mxn: null,
            rateMxnGtq: null,
            usdt: a.amount,
            clientName: null,
            operationRef: null,
            bankHint: null,
            userLabel: "—",
          });
        }
      }
    } catch {
      /* omitir */
    }
  }

  const omSettles = await loadOperatorMxnSettlementsForMajorBook(operatorId);
  for (const row of omSettles) {
    const sortAt = row.createdAt;
    const paidN = n(row.usdtPaid);
    const rate = row.gtqRateOptional;
    const hasGtqRate = rate != null && rate.gt(0);
    const gtqOut = hasGtqRate ? row.usdtPaid.mul(rate) : new Prisma.Decimal(0);
    const descParts = [
      `MXN entrada ${formatMoneyDisplay(row.mxnReceived, FiatCurrency.MXN)}`,
      `XE ${row.xeReference.toString()}`,
      `USDT referencia ${formatMoneyDisplay(row.referenceUsdt, "USDT")}`,
      `USDT salida ${formatMoneyDisplay(row.usdtPaid, "USDT")}`,
    ];
    if (hasGtqRate && rate) {
      descParts.push(`GTQ salida ${formatMoneyDisplay(gtqOut, FiatCurrency.GTQ)} (USDT pagados × tasa ${formatRateDisplay(rate)})`);
    } else {
      descParts.push("Falta tasa GTQ/USDT (`gtqRateOptional`): no se liquidó saldo GTQ con esta fila");
    }
    descParts.push(`Utilidad USDT ${formatMoneyDisplay(row.diffUsdt, "USDT")}`);
    if (row.notes?.trim()) descParts.push(row.notes.trim());
    const desc = descParts.join(" · ");
    const refShort = row.ref.length > 14 ? `${row.ref.slice(0, 14)}…` : row.ref;
    sources.push({
      sortKey: `om:${row.id}`,
      sortAt,
      systemCreatedAt: row.createdAt,
      displayType: "OPERADOR_MXN_USDT",
      reference: `MXN→USDT · ${refShort}`,
      description: desc,
      amountGtq: hasGtqRate ? gtqOut.neg() : new Prisma.Decimal(0),
      usdtSigned: -paidN,
      mxn: row.mxnReceived,
      rateMxnGtq: row.xeReference,
      usdt: row.usdtPaid,
      clientName: null,
      operationRef: row.ref,
      bankHint: null,
      userLabel: "—",
    });
  }

  try {
    const manuals = await prisma.statementEntry.findMany({
      where: {
        entityKind: StmtEntityKind.OPERATOR,
        operatorId,
        kind: StmtEntryKind.MANUAL_ADJUST,
      },
      select: {
        id: true,
        amountGtq: true,
        label: true,
        createdAt: true,
        postedAt: true,
      },
    });
    for (const m of manuals) {
      const sortAt = m.postedAt ?? m.createdAt;
      const lab = String(m.label ?? "").trim() || "Ajuste manual";
      sources.push({
        sortKey: `m:${m.id}`,
        sortAt,
        systemCreatedAt: m.createdAt,
        displayType: "AJUSTE_MANUAL",
        reference: `Manual · ${m.id.length > 14 ? `${m.id.slice(0, 14)}…` : m.id}`,
        description: lab,
        amountGtq: m.amountGtq,
        usdtSigned: 0,
        mxn: null,
        rateMxnGtq: null,
        usdt: null,
        clientName: null,
        operationRef: null,
        bankHint: null,
        userLabel: "—",
      });
    }
  } catch {
    /* omitir */
  }

  if (operatorName) {
    try {
      const needle = `Pago operador ${operatorName}`;
      const banks = await prisma.bankMovement.findMany({
        where: {
          type: BankMovementType.DEBIT,
          currency: FiatCurrency.GTQ,
          description: { contains: needle },
        },
        select: {
          id: true,
          amount: true,
          description: true,
          reference: true,
          date: true,
          createdAt: true,
        },
      });
      for (const b of banks) {
        const sortAt = b.date ?? b.createdAt;
        const amountGtq = b.amount.mul(new Prisma.Decimal(-1));
        sources.push({
          sortKey: `b:${b.id}`,
          sortAt,
          systemCreatedAt: b.createdAt,
          displayType: "PAGO_EVEREX_A_OPERADOR",
          reference: b.reference?.trim() || `BankMovement · ${b.id.slice(0, 12)}…`,
          description: b.description?.trim() || "—",
          amountGtq,
          usdtSigned: 0,
          mxn: null,
          rateMxnGtq: null,
          usdt: null,
          clientName: null,
          operationRef: null,
          bankHint: null,
          userLabel: "—",
        });
      }
    } catch {
      /* omitir */
    }
  }

  sources.sort((a, b) => {
    const t = a.sortAt.getTime() - b.sortAt.getTime();
    if (t !== 0) return t;
    return a.sortKey.localeCompare(b.sortKey);
  });

  const tPeriodStart = periodStart.getTime();
  const tPeriodEndEx = periodEndExclusive.getTime();

  /** Saldo acumulado antes del inicio del periodo (todo el historial con sortAt < periodStart). */
  let openingBalanceGtq = 0;
  let openingBalanceUsdt = 0;
  for (const s of sources) {
    if (s.sortAt.getTime() < tPeriodStart) {
      openingBalanceGtq += n(s.amountGtq);
      openingBalanceUsdt += s.usdtSigned;
    }
  }

  let currentBalanceGtq = 0;
  let currentBalanceUsdt = 0;
  try {
    const bal = await getOperatorBalance(operatorId);
    currentBalanceGtq = Number(bal.balanceGtq.toString());
    currentBalanceUsdt = bal.balanceUsdt;
  } catch {
    for (const s of sources) {
      currentBalanceGtq += n(s.amountGtq);
      currentBalanceUsdt += s.usdtSigned;
    }
  }

  const baseRows: Omit<MajorBookRow, "periodRunningGtq" | "periodRunningUsdt">[] = [];

  for (const s of sources) {
    const t = s.sortAt.getTime();
    if (t < tPeriodStart) continue;
    if (t >= tPeriodEndEx) continue;

    const amtN = n(s.amountGtq);
    const amt = s.amountGtq;
    const gtqDebit = amtN > 0 ? amt : null;
    const gtqCredit = amtN < 0 ? amt.abs() : null;
    const usdtEntry = s.usdtSigned > 0 ? new Prisma.Decimal(s.usdtSigned) : null;
    const usdtExit = s.usdtSigned < 0 ? new Prisma.Decimal(-s.usdtSigned) : null;

    baseRows.push({
      id: s.sortKey,
      postedAt: s.sortAt,
      systemCreatedAt: s.systemCreatedAt,
      displayType: s.displayType,
      reference: s.reference,
      description: s.description,
      mxn: s.mxn,
      rateMxnGtq: s.rateMxnGtq,
      gtqDebit,
      gtqCredit,
      usdt: s.usdt,
      usdtEntry,
      usdtExit,
      clientName: s.clientName,
      operationRef: s.operationRef,
      bankHint: s.bankHint,
      userLabel: s.userLabel,
      amountGtq: amt,
    });
  }

  let runGtq = openingBalanceGtq;
  let runUsdt = openingBalanceUsdt;
  const rows: MajorBookRow[] = baseRows.map((r) => {
    const usdtD = r.usdtEntry != null ? n(r.usdtEntry) : r.usdtExit != null ? -n(r.usdtExit) : 0;
    runGtq += n(r.amountGtq);
    runUsdt += usdtD;
    return { ...r, periodRunningGtq: runGtq, periodRunningUsdt: runUsdt };
  });

  let periodTotalMxnPurchases = 0;
  let periodTotalGtqPurchases = 0;
  let periodTotalUsdtPurchases = 0;
  let periodTotalClientPaymentsGtq = 0;
  let periodTotalEverexPaymentsGtq = 0;
  let periodTotalDebitsGtq = 0;
  let periodTotalCreditsGtq = 0;
  let periodTotalUsdtEntry = 0;
  let periodTotalUsdtExit = 0;

  for (const r of rows) {
    if (r.gtqDebit != null) periodTotalDebitsGtq += n(r.gtqDebit);
    if (r.gtqCredit != null) periodTotalCreditsGtq += n(r.gtqCredit);
    if (r.usdtEntry != null) periodTotalUsdtEntry += n(r.usdtEntry);
    if (r.usdtExit != null) periodTotalUsdtExit += n(r.usdtExit);
    if (r.displayType === "COMPRA_USDT_OPERADOR" || r.displayType === "COMPRA_USDT_PROV_MX_ASOC") {
      if (r.mxn != null) periodTotalMxnPurchases += n(r.mxn);
      if (r.gtqDebit != null) periodTotalGtqPurchases += n(r.gtqDebit);
      if (r.usdt != null) periodTotalUsdtPurchases += n(r.usdt);
    }
    if (r.displayType === "PAGO_CLIENTE_A_OPERADOR" && r.gtqCredit != null) {
      periodTotalClientPaymentsGtq += n(r.gtqCredit);
    }
    if (r.displayType === "PAGO_EVEREX_A_OPERADOR" && r.gtqCredit != null) {
      periodTotalEverexPaymentsGtq += n(r.gtqCredit);
    }
    if (r.displayType === "OPERADOR_MXN_USDT" && r.mxn != null) {
      periodTotalMxnPurchases += n(r.mxn);
    }
  }

  const lastClosingGtq = rows.length > 0 ? rows[rows.length - 1]!.periodRunningGtq : openingBalanceGtq;
  const lastClosingUsdt = rows.length > 0 ? rows[rows.length - 1]!.periodRunningUsdt : openingBalanceUsdt;

  return {
    partialLedger,
    periodLabel,
    periodStart,
    periodEndExclusive,
    openingBalanceGtq,
    closingBalanceGtq: lastClosingGtq,
    currentBalanceGtq: currentBalanceGtq,
    openingBalanceUsdt,
    closingBalanceUsdt: lastClosingUsdt,
    currentBalanceUsdt: currentBalanceUsdt,
    periodTotalMxnPurchases,
    periodTotalGtqPurchases,
    periodTotalUsdtPurchases,
    periodTotalClientPaymentsGtq,
    periodTotalEverexPaymentsGtq,
    periodTotalDebitsGtq,
    periodTotalCreditsGtq,
    periodTotalPaymentsAppliedGtq: periodTotalCreditsGtq,
    periodTotalUsdtEntry,
    periodTotalUsdtExit,
    rows,
  };
}

export function majorBookToCsv(book: OperatorMajorBook): string {
  const header = [
    "fecha_operativa",
    "fecha_registro_sistema",
    "tipo",
    "referencia",
    "descripcion",
    "cliente",
    "operacion",
    "mxn",
    "tasa_mxn_gtq",
    "gtq_entrada",
    "gtq_salida",
    "usdt",
    "usdt_entrada",
    "usdt_salida",
    "banco",
    "usuario",
    "saldo_acumulado_gtq_periodo",
    "saldo_acumulado_usdt_periodo",
  ];
  const lines = book.rows.map((r) =>
    [
      r.postedAt.toISOString(),
      r.systemCreatedAt.toISOString(),
      r.displayType,
      r.reference,
      r.description,
      r.clientName ?? "",
      r.operationRef ?? "",
      r.mxn?.toString() ?? "",
      r.rateMxnGtq?.toString() ?? "",
      r.gtqDebit?.toString() ?? "",
      r.gtqCredit?.toString() ?? "",
      r.usdt?.toString() ?? "",
      r.usdtEntry?.toString() ?? "",
      r.usdtExit?.toString() ?? "",
      r.bankHint ?? "",
      r.userLabel,
      String(r.periodRunningGtq),
      String(r.periodRunningUsdt),
    ]
      .map(escapeCsvField)
      .join(","),
  );
  return [header.join(","), ...lines].join("\r\n");
}

export function formatGtqCell(v: Prisma.Decimal | null): string {
  if (v == null) return "—";
  return formatMoneyDisplay(v, FiatCurrency.GTQ);
}

export function formatMxnCell(v: Prisma.Decimal | null): string {
  if (v == null) return "—";
  return formatMoneyDisplay(v, FiatCurrency.MXN);
}

export function formatUsdtCell(v: Prisma.Decimal | null): string {
  if (v == null) return "—";
  return formatMoneyDisplay(v, "USDT");
}
