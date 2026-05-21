import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  EverexCreditorType,
  FiatCurrency,
  OtcSide,
  Prisma,
  PurchaseCounterparty,
  UserRole,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { computeInventoryFromDb, type InventoryDiagnostics, type InventoryPurchaseRowDebug } from "@/lib/inventory";
import { todayDayKey } from "@/lib/day-key";
import { prismaWhereDayKeyInRange } from "@/lib/operative-datetime";
import { formatMoneyDisplay } from "@/lib/format-money";
import { formatRateDisplay } from "@/lib/format-rate";
import { EST_GTQ_PER_USD, gtqToUsdtEquiv } from "@/lib/fx";
import {
  canManageBanks,
  canViewSensitiveProfitMetrics,
  isAdmin,
  isOperationsRole,
  isTreasury,
  usesOperationalDashboard,
} from "@/lib/authz";
import { loadOperationalDashboardSnapshot } from "@/lib/operational-dashboard";
import { OperationalDashboard } from "./OperationalDashboard";
import { getTodayAndMonthSummary } from "@/lib/financial-summary";
import {
  getOperatorBalance,
  loadOperatorBalanceRowsForDashboard,
  loadOperatorUsdtBalanceDebugForAdmin,
  type OperatorUsdtBalanceDebugRow,
} from "@/lib/operator-ledger";
import { getBankBalanceBreakdown } from "@/lib/bank-balance";
import type { BankBalanceBreakdown } from "@/lib/bank-balance";
import { ReportedBalanceForm } from "@/app/bancos/ReportedBalanceForm";
import { isAppUserRole } from "@/lib/roles";
import { parseSessionRoleCookie, SESSION_ROLE_COOKIE } from "@/lib/session-cookies";
import type { User } from "@prisma/client";
import { CLIENT_OTC_ADVANCE_REASON_SUBSTR, isClientOtcAdvancePayable } from "@/lib/everex-payable-client-advance";
import { loadProviderMxBalanceRowsFromDb, type ProviderMxBalanceRow } from "@/lib/provider-mx-balances";

export const dynamic = "force-dynamic";

const EMPTY_INVENTORY_DIAGNOSTICS: InventoryDiagnostics = {
  totalPurchaseRows: 0,
  operatorPurchaseRows: 0,
  providerPurchaseRows: 0,
  purchaseSumUsdt: 0,
  purchaseSumGtq: 0,
  ventasUsdtSubtotal: 0,
  operatorMxnUsdtPaidSubtotal: 0,
  inventarioFinalUsdt: 0,
  purchaseRowsRecent: [],
};

type ClientAdvanceRow = { id: string; creditorName: string; balance: number };

type DashboardLoaded = {
  dayKey: string;
  inv: Awaited<ReturnType<typeof computeInventoryFromDb>>;
  showSensitiveProfit: boolean;
  fin: Awaited<ReturnType<typeof getTodayAndMonthSummary>> | null;
  showMiniFin: boolean;
  ventasUsdt: number;
  utilidadUsdt: number;
  utilidadVentasGtqEquivUsdt: number;
  utilidadOperadorMxnUsdt: number;
  expensesGtqToday: number;
  expensesUsdtEquiv: number;
  utilidadTotalUsdt: number;
  operators: { id: string; name: string }[];
  opBalances: Map<string, number>;
  opUsdtBalances: Map<string, number>;
  bankPanels: { id: string; label: string; currency: FiatCurrency; breakdown: BankBalanceBreakdown }[];
  provMxn: number;
  provUsdt: number;
  provDiff: number | null;
  utilidadMxnSpreadUsdt: number;
  operatorMxnUsdtPaidToday: number;
  totalPendingClientDeliveryGtq: number;
  clientAdvanceRows: ClientAdvanceRow[];
  /** Diagnóstico temporal (solo admin): desglose USDT por operador (compras + OTC − MXN→USDT). */
  operatorUsdtDebugRows: OperatorUsdtBalanceDebugRow[] | null;
  /** Diagnóstico temporal (solo admin): mismos totales que `computeInventoryFromDb`. */
  purchaseInventoryDebug: {
    totalPurchaseRows: number;
    operatorPurchaseRows: number;
    providerPurchaseRows: number;
    sumUsdt: number;
    sumGtq: number;
    ventasUsdtSubtotal: number;
    operatorMxnUsdtPaidSubtotal: number;
    inventarioFinalUsdt: number;
    providerMxTodayCount: number;
    purchaseRowsRecent: InventoryPurchaseRowDebug[];
  } | null;
  /** Acumulado por proveedor desde UsdtPurchase (solo tesorería). */
  providerMxRowsFromDb: ProviderMxBalanceRow[];
};

async function loadDashboardData(user: User): Promise<DashboardLoaded> {
  const dayKey = todayDayKey();
  const showSensitiveProfit = canViewSensitiveProfitMetrics(user);
  const showMiniFin = isTreasury(user);

  const [
    inv,
    opsToday,
    spreadTodayAgg,
    purchasesProviderToday,
    bankAccounts,
    fin,
    operatorMxnAgg,
    clientAdvanceCandidates,
  ] = await Promise.all([
    isTreasury(user)
      ? computeInventoryFromDb()
      : Promise.resolve({
          usdt: 0,
          gtqBasis: 0,
          avgGtqPerUsdt: 0,
          diagnostics: EMPTY_INVENTORY_DIAGNOSTICS,
        }),
    prisma.otcOperation.findMany({
      where: prismaWhereDayKeyInRange(dayKey, dayKey),
      select: showSensitiveProfit
        ? { side: true, usdtAmount: true, profitGtq: true, profitUsd: true, profitUsdt: true }
        : { side: true, usdtAmount: true },
    }),
    showSensitiveProfit
      ? prisma.otcMxnSpread.aggregate({
          where: prismaWhereDayKeyInRange(dayKey, dayKey),
          _sum: { profitUsdt: true },
        })
      : Promise.resolve({ _sum: { profitUsdt: null as null } }),
    prisma.usdtPurchase.findMany({
      where: {
        AND: [{ counterparty: PurchaseCounterparty.PROVIDER_MX }, prismaWhereDayKeyInRange(dayKey, dayKey)],
      },
      select: { amountMxn: true, usdtAmount: true, rateXe: true, gtqTotal: true },
    }),
    prisma.bankAccount.findMany({
      where: { active: true },
      orderBy: { label: "asc" },
    }),
    showMiniFin ? getTodayAndMonthSummary(dayKey) : Promise.resolve(null),
    showSensitiveProfit
      ? prisma.operatorMxnUsdtSettlement.aggregate({
          where: prismaWhereDayKeyInRange(dayKey, dayKey),
          _sum: { usdtPaid: true, diffUsdt: true },
        })
      : Promise.resolve({ _sum: { usdtPaid: null as null, diffUsdt: null as null } }),
    showSensitiveProfit
      ? prisma.everexPayable.findMany({
          where: {
            active: true,
            creditorType: EverexCreditorType.CLIENT,
            currency: FiatCurrency.GTQ,
            reason: { contains: CLIENT_OTC_ADVANCE_REASON_SUBSTR },
            balance: { gt: 0 },
          },
          select: { id: true, creditorName: true, balance: true, reason: true, creditorType: true },
          orderBy: { balance: "desc" },
          take: 80,
        })
      : Promise.resolve(
          [] as {
            id: string;
            creditorName: string;
            balance: Prisma.Decimal;
            reason: string;
            creditorType: EverexCreditorType;
          }[],
        ),
  ]);

  const providerMxRowsFromDb = isTreasury(user) ? await loadProviderMxBalanceRowsFromDb() : [];

  const ventasUsdt = opsToday
    .filter((o) => o.side === OtcSide.CLIENT_BUYS_USDT)
    .reduce((s, o) => s + Number(o.usdtAmount.toString()), 0);

  let utilidadGtq = 0;
  let utilidadUsdt = 0;
  if (showSensitiveProfit) {
    const rows = opsToday as Array<{
      side: OtcSide;
      usdtAmount: Prisma.Decimal;
      profitGtq: Prisma.Decimal | null;
      profitUsdt: Prisma.Decimal | null;
    }>;
    for (const o of rows) {
      if (o.side !== OtcSide.CLIENT_BUYS_USDT) continue;
      utilidadGtq += Number((o.profitGtq ?? 0).toString());
      utilidadUsdt += Number((o.profitUsdt ?? 0).toString());
    }
  }
  const utilidadMxnSpreadUsdt = showSensitiveProfit
    ? Number(spreadTodayAgg._sum.profitUsdt?.toString() ?? "0")
    : 0;
  const operatorMxnUsdtPaidToday = showSensitiveProfit
    ? Number(operatorMxnAgg._sum.usdtPaid?.toString() ?? "0")
    : 0;
  const utilidadOperadorMxnUsdt = showSensitiveProfit
    ? Number(operatorMxnAgg._sum.diffUsdt?.toString() ?? "0")
    : 0;

  const clientAdvanceRows: ClientAdvanceRow[] = showSensitiveProfit
    ? clientAdvanceCandidates
        .filter((p) => isClientOtcAdvancePayable(p))
        .map((p) => ({
          id: p.id,
          creditorName: p.creditorName,
          balance: Number(p.balance.toString()),
        }))
    : [];
  const totalPendingClientDeliveryGtq = clientAdvanceRows.reduce((s, r) => s + r.balance, 0);

  const expensesGtqToday = fin?.today.expensesGtq ?? 0;
  const expensesUsdtEquiv = showSensitiveProfit ? gtqToUsdtEquiv(expensesGtqToday) : 0;
  const utilidadVentasGtqEquivUsdt = showSensitiveProfit ? gtqToUsdtEquiv(utilidadGtq) : 0;
  const utilidadTotalUsdt =
    utilidadVentasGtqEquivUsdt +
    utilidadUsdt +
    utilidadMxnSpreadUsdt +
    utilidadOperadorMxnUsdt -
    expensesUsdtEquiv;

  const operators = await prisma.operator.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const opBalList = await Promise.all(operators.map((o) => getOperatorBalance(o.id)));
  const opBalances = new Map(operators.map((o, i) => [o.id, Number(opBalList[i]!.balanceGtq.toString())] as const));
  const opUsdtBalances = new Map(operators.map((o, i) => [o.id, opBalList[i]!.balanceUsdt] as const));

  const operatorUsdtDebugRows = isAdmin(user) ? await loadOperatorUsdtBalanceDebugForAdmin() : null;

  const bankPanels = await Promise.all(
    bankAccounts.map(async (acc) => ({
      id: acc.id,
      label: acc.label,
      currency: acc.currency,
      breakdown: await getBankBalanceBreakdown(acc.id, dayKey),
    })),
  );

  let provMxn = 0;
  let provUsdt = 0;
  let provExpectedUsdt = 0;
  for (const p of purchasesProviderToday) {
    provMxn += Number((p.amountMxn ?? 0).toString());
    provUsdt += Number(p.usdtAmount.toString());
    const rx = p.rateXe ? Number(p.rateXe.toString()) : 0;
    if (rx > 0 && p.amountMxn) provExpectedUsdt += Number(p.amountMxn.toString()) / rx;
  }
  const provDiff = provExpectedUsdt > 0 ? provUsdt - provExpectedUsdt : null;

  const purchaseInventoryDebug: DashboardLoaded["purchaseInventoryDebug"] = isAdmin(user)
    ? {
        totalPurchaseRows: inv.diagnostics.totalPurchaseRows,
        operatorPurchaseRows: inv.diagnostics.operatorPurchaseRows,
        providerPurchaseRows: inv.diagnostics.providerPurchaseRows,
        sumUsdt: inv.diagnostics.purchaseSumUsdt,
        sumGtq: inv.diagnostics.purchaseSumGtq,
        ventasUsdtSubtotal: inv.diagnostics.ventasUsdtSubtotal,
        operatorMxnUsdtPaidSubtotal: inv.diagnostics.operatorMxnUsdtPaidSubtotal,
        inventarioFinalUsdt: inv.diagnostics.inventarioFinalUsdt,
        providerMxTodayCount: purchasesProviderToday.length,
        purchaseRowsRecent: inv.diagnostics.purchaseRowsRecent,
      }
    : null;

  return {
    dayKey,
    inv,
    showSensitiveProfit,
    fin,
    showMiniFin,
    ventasUsdt,
    utilidadUsdt,
    utilidadVentasGtqEquivUsdt,
    utilidadOperadorMxnUsdt,
    expensesGtqToday,
    expensesUsdtEquiv,
    utilidadTotalUsdt,
    operators,
    opBalances,
    opUsdtBalances,
    bankPanels,
    provMxn,
    provUsdt,
    provDiff,
    utilidadMxnSpreadUsdt,
    operatorMxnUsdtPaidToday,
    totalPendingClientDeliveryGtq,
    clientAdvanceRows,
    purchaseInventoryDebug,
    providerMxRowsFromDb,
    operatorUsdtDebugRows,
  };
}

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (!isAppUserRole(user.role)) {
    redirect("/login?error=role");
  }

  const cookieStore = await cookies();
  const cookieRole = parseSessionRoleCookie(cookieStore.get(SESSION_ROLE_COOKIE)?.value);
  if (cookieRole == null || cookieRole !== user.role) {
    redirect("/login?error=role");
  }

  if (usesOperationalDashboard(user)) {
    let opData: Awaited<ReturnType<typeof loadOperationalDashboardSnapshot>> | undefined;
    let opBalances: Awaited<ReturnType<typeof loadOperatorBalanceRowsForDashboard>> | undefined;
    let opErr: string | null = null;
    try {
      [opData, opBalances] = await Promise.all([
        loadOperationalDashboardSnapshot(),
        loadOperatorBalanceRowsForDashboard(),
      ]);
    } catch (e) {
      console.error("[dashboard] loadOperationalDashboardSnapshot:", e);
      opErr = e instanceof Error ? e.message : "No se pudo cargar el tablero operativo.";
    }
    if (opErr || !opData) {
      return (
        <main className="mx-auto max-w-5xl px-4 py-6">
          <h1 className="text-lg font-semibold text-zinc-900">Dashboard operativo</h1>
          <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-medium">No se pudo cargar el tablero</p>
            <p className="mt-2 break-words font-mono text-xs">{opErr ?? "Sin datos"}</p>
          </div>
        </main>
      );
    }
    return (
      <OperationalDashboard data={opData} operatorBalances={opBalances ?? []} hideTreasuryModules={isOperationsRole(user)} />
    );
  }

  let d: DashboardLoaded | undefined;
  let loadError: string | null = null;

  try {
    d = await loadDashboardData(user);
  } catch (e) {
    console.error("[dashboard] loadDashboardData:", e);
    loadError = e instanceof Error ? e.message : "No se pudo cargar datos del tablero.";
  }

  if (loadError || !d) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="text-lg font-semibold text-zinc-900">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Resumen del día. Si el problema es temporal, reintente; si no, revise la base de datos o contacte soporte.
        </p>
        <div className="mt-6 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">No se pudo calcular el resumen del dashboard</p>
          <p className="mt-2 break-words font-mono text-xs">{loadError ?? "Sin datos"}</p>
          <ul className="mt-4 list-inside list-disc space-y-1 text-xs">
            <li>
              <Link href="/bancos" className="text-amber-900 underline">
                Ir a bancos
              </Link>
            </li>
            <li>
              <Link href="/operaciones" className="text-amber-900 underline">
                Ir a operaciones
              </Link>
            </li>
            <li>
              <Link href="/login" className="text-amber-900 underline">
                Cerrar sesión e iniciar de nuevo
              </Link>
            </li>
          </ul>
        </div>
      </main>
    );
  }

  const {
    dayKey,
    inv,
    showSensitiveProfit,
    fin,
    showMiniFin,
    ventasUsdt,
    utilidadUsdt,
    utilidadVentasGtqEquivUsdt,
    utilidadOperadorMxnUsdt,
    expensesGtqToday,
    expensesUsdtEquiv,
    utilidadTotalUsdt,
    operators,
    opBalances,
    opUsdtBalances,
    bankPanels,
    provMxn,
    provUsdt,
    provDiff,
    utilidadMxnSpreadUsdt,
    operatorMxnUsdtPaidToday,
    totalPendingClientDeliveryGtq,
    clientAdvanceRows,
    purchaseInventoryDebug,
    providerMxRowsFromDb,
    operatorUsdtDebugRows,
  } = d;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-lg font-semibold text-zinc-900">Dashboard</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Resumen del día ({dayKey}).
        {showSensitiveProfit ? <> USD estimado con {EST_GTQ_PER_USD} GTQ/USD.</> : null}
      </p>

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        {showSensitiveProfit ? (
          <div className="rounded border border-emerald-300 bg-emerald-50/70 p-4 sm:col-span-2">
            <h2 className="text-sm font-semibold text-emerald-950">Utilidad total del día (USDT / USD ref.)</h2>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-950">
              {formatMoneyDisplay(utilidadTotalUsdt, "USDT")}
            </p>
            <p className="mt-1 text-xs text-emerald-900/90">
              Suma componentes en USDT (venta GTQ → USDT con {EST_GTQ_PER_USD} GTQ/USD) menos gastos GTQ del día
              (equiv. USDT). Referencia aproximada USD ≈ USDT.
            </p>
            <dl className="mt-3 grid gap-1.5 text-sm text-emerald-950/95 sm:grid-cols-2">
              <div className="flex justify-between gap-4 border-b border-emerald-200/80 py-1">
                <dt className="text-emerald-900/90">Venta mesa (util. GTQ → USDT)</dt>
                <dd className="tabular-nums font-medium">{formatMoneyDisplay(utilidadVentasGtqEquivUsdt, "USDT")}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-emerald-200/80 py-1">
                <dt className="text-emerald-900/90">Venta mesa (util. USDT directo)</dt>
                <dd className="tabular-nums font-medium">{formatMoneyDisplay(utilidadUsdt, "USDT")}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-emerald-200/80 py-1">
                <dt className="text-emerald-900/90">Cliente MXN spread</dt>
                <dd className="tabular-nums font-medium">{formatMoneyDisplay(utilidadMxnSpreadUsdt, "USDT")}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-emerald-200/80 py-1">
                <dt className="text-emerald-900/90">Operador MXN→USDT (Δ ref. vs pagado)</dt>
                <dd className="tabular-nums font-medium">{formatMoneyDisplay(utilidadOperadorMxnUsdt, "USDT")}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-emerald-200/80 py-1 sm:col-span-2">
                <dt className="text-emerald-900/90">Gastos día (equiv. USDT)</dt>
                <dd className="tabular-nums font-medium text-red-900">
                  −{formatMoneyDisplay(expensesUsdtEquiv, "USDT")}{" "}
                  <span className="text-xs font-normal text-zinc-600">
                    ({formatMoneyDisplay(expensesGtqToday, FiatCurrency.GTQ)} GTQ)
                  </span>
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-1 font-semibold sm:col-span-2">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatMoneyDisplay(utilidadTotalUsdt, "USDT")}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-zinc-600">
              Volumen USDT pagado a operadores (MXN→USDT) hoy: {formatMoneyDisplay(operatorMxnUsdtPaidToday, "USDT")}{" "}
              (inventario; no es utilidad).
            </p>
          </div>
        ) : (
          <div className="rounded border border-zinc-200 bg-zinc-50 p-4 sm:col-span-2">
            <h2 className="text-sm font-medium text-zinc-800">Utilidad OTC (bruta)</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Solo administración ve utilidad e inventario global. Operaciones y caja siguen abajo.
            </p>
          </div>
        )}
        {showSensitiveProfit ? (
          <div className="rounded border border-amber-200 bg-amber-50/70 p-4 sm:col-span-2">
            <h2 className="text-sm font-semibold text-amber-950">Clientes — saldo pendiente por entregar (anticipos)</h2>
            <p className="mt-2 text-lg font-semibold tabular-nums text-amber-950">
              {formatMoneyDisplay(totalPendingClientDeliveryGtq, FiatCurrency.GTQ)} GTQ
            </p>
            <p className="mt-1 text-xs text-amber-900/90">
              Pasivo por GTQ recibido por encima del tramo aplicado a USDT entregado (no es utilidad).
            </p>
            {clientAdvanceRows.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-600">Sin saldos abiertos de este tipo.</p>
            ) : (
              <ul className="mt-3 divide-y divide-amber-200/80 text-sm">
                {clientAdvanceRows.map((r) => (
                  <li key={r.id} className="flex justify-between gap-4 py-2">
                    <span className="font-medium text-amber-950">{r.creditorName}</span>
                    <span className="tabular-nums">
                      <Link href={`/deudas/${r.id}`} className="text-amber-900 underline">
                        {formatMoneyDisplay(r.balance, FiatCurrency.GTQ)}
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        {isTreasury(user) ? (
          <div className="rounded border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-medium text-zinc-800">Inventario USDT</h2>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{formatMoneyDisplay(inv.usdt, "USDT")}</p>
            <p className="text-sm text-zinc-600">Costo prom. {formatRateDisplay(inv.avgGtqPerUsdt)} GTQ/USDT</p>
            <p className="mt-2 text-xs text-zinc-500">
              Inventario global = SUM(<code className="text-zinc-600">UsdtPurchase.usdtAmount</code>, OPERATOR + PROVIDER_MX) −
              ventas OTC cliente compra − pagos USDT MXN→USDT. Las compras <strong>OPERATOR</strong> también mueven el
              saldo GTQ/USDT del operador (abajo). Las compras <strong>PROVIDER_MX</strong> solo acumulan al proveedor MX
              e inventario; <strong>no</strong> suman a operadores.
            </p>
            {purchaseInventoryDebug ? (
              <div className="mt-3 rounded border border-dashed border-zinc-300 bg-zinc-50 p-2 font-mono text-[11px] leading-relaxed text-zinc-700">
                <div className="font-semibold text-zinc-800">Diagnóstico compras (solo admin, temporal)</div>
                <div>UsdtPurchase total rows (OPERATOR + PROVIDER_MX, usdtAmount &gt; 0): {purchaseInventoryDebug.totalPurchaseRows}</div>
                <div>Filas PROVIDER_MX: {purchaseInventoryDebug.providerPurchaseRows}</div>
                <div>Filas OPERATOR: {purchaseInventoryDebug.operatorPurchaseRows}</div>
                <div>purchaseUsdtTotal (SUM en BD): {purchaseInventoryDebug.sumUsdt.toFixed(4)}</div>
                <div>purchaseGtqTotal (SUM en BD): {purchaseInventoryDebug.sumGtq.toFixed(2)}</div>
                <div>Ventas USDT restadas (OTC CLIENT_BUYS, histórico): {purchaseInventoryDebug.ventasUsdtSubtotal.toFixed(4)}</div>
                <div>Pagos USDT operador restados (MXN→USDT, histórico): {purchaseInventoryDebug.operatorMxnUsdtPaidSubtotal.toFixed(4)}</div>
                <div className="font-medium text-zinc-900">
                  Inventario final calculado: {purchaseInventoryDebug.inventarioFinalUsdt.toFixed(4)}
                </div>
                <div className="mt-1 border-t border-zinc-200 pt-1 text-zinc-600">
                  Proveedor MX con fecha operativa hoy ({dayKey}): {purchaseInventoryDebug.providerMxTodayCount} — solo
                  el cuadro de abajo “hoy”.
                </div>
                {purchaseInventoryDebug.purchaseRowsRecent.length > 0 ? (
                  <div className="mt-2 max-h-48 overflow-auto border-t border-zinc-200 pt-2">
                    <div className="mb-1 font-medium text-zinc-800">Últimas 10 compras usadas en el cálculo</div>
                    <table className="min-w-[720px] w-full border-collapse text-left text-[10px]">
                      <thead>
                        <tr className="border-b border-zinc-200 text-zinc-600">
                          <th className="py-0.5 pr-1">id</th>
                          <th className="py-0.5 pr-1">counterparty</th>
                          <th className="py-0.5 pr-1">providerId</th>
                          <th className="py-0.5 pr-1">operatorId</th>
                          <th className="py-0.5 pr-1">dayKey</th>
                          <th className="py-0.5 pr-1 text-right">usdtAmount</th>
                          <th className="py-0.5 text-right">gtqTotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchaseInventoryDebug.purchaseRowsRecent.map((r) => (
                          <tr key={r.id} className="border-b border-zinc-100">
                            <td className="max-w-[100px] truncate py-0.5 pr-1 align-top font-mono">{r.id}</td>
                            <td className="py-0.5 pr-1 align-top">{r.counterparty}</td>
                            <td className="max-w-[80px] truncate py-0.5 pr-1 align-top font-mono">{r.providerId ?? "—"}</td>
                            <td className="max-w-[80px] truncate py-0.5 pr-1 align-top font-mono">{r.operatorId ?? "—"}</td>
                            <td className="py-0.5 pr-1 align-top">{r.dayKey}</td>
                            <td className="py-0.5 pr-1 text-right align-top tabular-nums">{r.usdt.toFixed(4)}</td>
                            <td className="py-0.5 text-right align-top tabular-nums">{r.gtq.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded border border-zinc-200 bg-zinc-50 p-4">
            <h2 className="text-sm font-medium text-zinc-800">Inventario USDT</h2>
            <p className="mt-2 text-sm text-zinc-600">Disponible solo para administración.</p>
          </div>
        )}
        {showSensitiveProfit ? (
          <div className="rounded border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-medium text-zinc-800">Ventas día (USDT vendidos)</h2>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{formatMoneyDisplay(ventasUsdt, "USDT")}</p>
          </div>
        ) : null}
        {isTreasury(user) ? (
          <div className="rounded border border-zinc-200 bg-white p-4 sm:col-span-2">
            <h2 className="text-sm font-medium text-zinc-800">Proveedor MX — compras con fecha operativa hoy</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Solo compras <code className="text-zinc-600">PROVIDER_MX</code> registradas hoy ({dayKey}). No es el
              listado de saldos de operadores.
            </p>
            <p className="mt-1 text-sm tabular-nums">
              MXN {formatMoneyDisplay(provMxn, FiatCurrency.MXN)} · USDT recibidos {formatMoneyDisplay(provUsdt, "USDT")}
            </p>
            {provDiff != null ? (
              <p className={`mt-1 text-sm font-medium ${Math.abs(provDiff) < 1 ? "text-emerald-800" : "text-amber-800"}`}>
                Δ vs XE: {formatMoneyDisplay(provDiff, "USDT")}{" "}
                {Math.abs(provDiff) < 1 ? "(cuadrado)" : "(revisar)"}
              </p>
            ) : (
              <p className="mt-1 text-xs text-zinc-500">Sin tasa XE en compras de hoy — no se estima diferencia.</p>
            )}
          </div>
        ) : null}
      </section>

      {showMiniFin && fin ? (
        <section className="mt-6 rounded border border-indigo-200 bg-indigo-50/60 p-4">
          <h2 className="text-sm font-semibold text-indigo-950">Mini estado financiero</h2>
          <p className="mt-1 text-xs text-indigo-900/80">Acumulado del mes (GTQ salvo nota).</p>
          {isAdmin(user) ? (
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-4 border-b border-indigo-100 py-1">
                <dt className="text-zinc-700">Ganancia bruta OTC — equiv. GTQ (mes)</dt>
                <dd className="tabular-nums font-medium text-emerald-900">
                  {formatMoneyDisplay(fin.month.otcGrossCombinedGtq, FiatCurrency.GTQ)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-indigo-100 py-1 sm:col-span-2 text-xs text-zinc-600">
                <dt>Detalle (GTQ / USDT mesa / USDT spread)</dt>
                <dd className="tabular-nums">
                  {formatMoneyDisplay(fin.month.otcGrossGtq, FiatCurrency.GTQ)} ·{" "}
                  {formatMoneyDisplay(fin.month.otcProfitUsdt, "USDT")} ·{" "}
                  {formatMoneyDisplay(fin.month.mxnSpreadProfitUsdt, "USDT")}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-indigo-100 py-1">
                <dt className="text-zinc-700">Gastos (mes)</dt>
                <dd className="tabular-nums font-medium text-red-900">
                  {formatMoneyDisplay(fin.month.expensesGtq, FiatCurrency.GTQ)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-indigo-100 py-1">
                <dt className="text-zinc-700">Pagos de deuda Everex (mes)</dt>
                <dd className="tabular-nums font-medium">
                  {formatMoneyDisplay(fin.month.debtPaymentsGtq, FiatCurrency.GTQ)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-indigo-100 py-1">
                <dt className="text-zinc-700">Recuperaciones deudores (mes)</dt>
                <dd className="tabular-nums font-medium text-blue-900">
                  {formatMoneyDisplay(fin.month.recoveriesGtq, FiatCurrency.GTQ)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-indigo-100 py-1 sm:col-span-2">
                <dt className="text-zinc-700">Utilidad neta (bruta − gastos − pagos deuda)</dt>
                <dd className="tabular-nums text-base font-semibold">
                  {formatMoneyDisplay(fin.month.netOperatingGtq, FiatCurrency.GTQ)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-indigo-100 py-1">
                <dt className="text-zinc-700">Cuentas por cobrar (pendiente)</dt>
                <dd className="tabular-nums font-medium">
                  {formatMoneyDisplay(fin.month.pendingReceivablesGtq, FiatCurrency.GTQ)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-indigo-100 py-1">
                <dt className="text-zinc-700">Deudas Everex (pendiente)</dt>
                <dd className="tabular-nums font-medium">
                  {formatMoneyDisplay(fin.month.pendingPayablesGtq, FiatCurrency.GTQ)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-indigo-100 py-1">
                <dt className="text-zinc-700">Anticipos cliente (USDT por entregar, GTQ)</dt>
                <dd className="tabular-nums font-medium text-amber-900">
                  {formatMoneyDisplay(fin.month.pendingClientAdvancesGtq, FiatCurrency.GTQ)}
                </dd>
              </div>
            </dl>
          ) : (
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-4 border-b border-indigo-100 py-1">
                <dt className="text-zinc-700">Gastos acumulados (mes)</dt>
                <dd className="tabular-nums font-medium text-red-900">
                  {formatMoneyDisplay(fin.month.expensesGtq, FiatCurrency.GTQ)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-indigo-100 py-1">
                <dt className="text-zinc-700">Pagos de deuda (mes)</dt>
                <dd className="tabular-nums font-medium">
                  {formatMoneyDisplay(fin.month.debtPaymentsGtq, FiatCurrency.GTQ)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-indigo-100 py-1">
                <dt className="text-zinc-700">Recuperaciones (mes)</dt>
                <dd className="tabular-nums font-medium text-blue-900">
                  {formatMoneyDisplay(fin.month.recoveriesGtq, FiatCurrency.GTQ)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-indigo-100 py-1">
                <dt className="text-zinc-700">Cuentas por cobrar (pendiente)</dt>
                <dd className="tabular-nums font-medium">
                  {formatMoneyDisplay(fin.month.pendingReceivablesGtq, FiatCurrency.GTQ)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-indigo-100 py-1">
                <dt className="text-zinc-700">Deudas Everex (pendiente)</dt>
                <dd className="tabular-nums font-medium">
                  {formatMoneyDisplay(fin.month.pendingPayablesGtq, FiatCurrency.GTQ)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-indigo-100 py-1">
                <dt className="text-zinc-700">Anticipos cliente (GTQ)</dt>
                <dd className="tabular-nums font-medium text-amber-900">
                  {formatMoneyDisplay(fin.month.pendingClientAdvancesGtq, FiatCurrency.GTQ)}
                </dd>
              </div>
            </dl>
          )}
          {isAdmin(user) ? (
            <p className="mt-3 text-xs">
              <Link href="/estado-financiero" className="text-indigo-800 underline">
                Estado financiero detallado
              </Link>
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="mt-6 rounded border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-medium text-zinc-800">Saldos operadores (libro interno)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          GTQ: compras operador / proveedor MX asociado, menos reparto OTC cliente en GTQ, débitos banco “Pago operador
          …”, liquidaciones MXN→USDT con tasa (<code className="text-zinc-600">usdtPaid</code> ×{" "}
          <code className="text-zinc-600">gtqRateOptional</code> en <code className="text-zinc-600">OperatorMxnUsdtSettlement</code>
          ), más ajustes manuales. Si la liquidación no lleva tasa, no rebaja GTQ en este cálculo.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Saldos USDT con histórico completo: SUM(<code className="text-zinc-600">UsdtPurchase.usdtAmount</code>,{" "}
          <code className="text-zinc-600">OPERATOR</code> o <code className="text-zinc-600">PROVIDER_MX</code> con este
          operador) + SUM(<code className="text-zinc-600">OtcAllocation</code> al operador en USDT) − SUM(
          <code className="text-zinc-600">OperatorMxnUsdtSettlement.usdtPaid</code>). Las liquidaciones MXN→USDT restan
          por <code className="text-zinc-600">usdtPaid</code> (no por asientos de libro).{" "}
          <Link href="/operadores" className="text-blue-700 underline">
            Ver operadores
          </Link>
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          {operators.map((o) => (
            <li key={o.id} className="flex justify-between gap-4 border-b border-zinc-100 py-1">
              <span>{o.name}</span>
              <span className="text-right text-xs tabular-nums">
                <span className="block font-medium">{formatMoneyDisplay(opBalances.get(o.id) ?? 0, FiatCurrency.GTQ)}</span>
                <span className="block text-zinc-500">{formatMoneyDisplay(opUsdtBalances.get(o.id) ?? 0, "USDT")}</span>
              </span>
            </li>
          ))}
        </ul>
        {operatorUsdtDebugRows && operatorUsdtDebugRows.length > 0 ? (
          <div className="mt-3 rounded border border-dashed border-amber-300 bg-amber-50/80 p-2 font-mono text-[11px] leading-relaxed text-amber-950">
            <div className="font-semibold text-amber-950">Diagnóstico saldo USDT operador (solo admin, temporal)</div>
            <p className="mt-1 text-[10px] text-amber-900/90">
              Valida <code className="text-amber-950">OperatorMxnUsdtSettlement.usdtPaid</code> por{" "}
              <code className="text-amber-950">operatorId</code> (histórico). Si <code>mxnUsdtPaidOut</code> es 0 con
              liquidaciones visibles, revisar FK; si coincide con USDT pagados y el saldo no cuadra, revisar fórmula.
            </p>
            <div className="mt-2 max-h-64 overflow-auto border-t border-amber-200/80 pt-2">
              <table className="min-w-[640px] w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-amber-200 text-amber-900/90">
                    <th className="py-0.5 pr-1">nombre</th>
                    <th className="py-0.5 pr-1">operatorId</th>
                    <th className="py-0.5 pr-1 text-right">purchasesUsdt</th>
                    <th className="py-0.5 pr-1 text-right">otcAllocUsdt</th>
                    <th className="py-0.5 pr-1 text-right">mxnUsdtPaidOut</th>
                    <th className="py-0.5 text-right">finalUsdtBalance</th>
                  </tr>
                </thead>
                <tbody>
                  {operatorUsdtDebugRows.map((r) => (
                    <tr key={r.operatorId} className="border-b border-amber-100/80">
                      <td className="py-0.5 pr-1 align-top">{r.name}</td>
                      <td className="max-w-[100px] truncate py-0.5 pr-1 align-top">{r.operatorId}</td>
                      <td className="py-0.5 pr-1 text-right align-top tabular-nums">{r.purchasesUsdt.toFixed(4)}</td>
                      <td className="py-0.5 pr-1 text-right align-top tabular-nums">{r.otcAllocUsdt.toFixed(4)}</td>
                      <td className="py-0.5 pr-1 text-right align-top tabular-nums">{r.mxnUsdtPaidOut.toFixed(4)}</td>
                      <td className="py-0.5 text-right align-top tabular-nums font-medium">
                        {r.finalUsdtBalance.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      {isTreasury(user) ? (
        <section className="mt-6 rounded border border-violet-200 bg-violet-50/50 p-4">
          <h2 className="text-sm font-medium text-violet-950">Saldos proveedores MX (solo PROVIDER_MX)</h2>
          <p className="mt-1 text-xs text-violet-900/90">
            Acumulado histórico MXN / GTQ / USDT por proveedor desde <code className="text-violet-950">UsdtPurchase</code>{" "}
            con <code className="text-violet-950">counterparty = PROVIDER_MX</code> y <code className="text-violet-950">providerId</code>.
            <code className="text-violet-950">operatorId</code> es opcional; si existe, esos mismos montos también
            alimentan al operador en la sección de saldos operadores.{" "}
            <Link href="/proveedores" className="font-medium text-violet-900 underline">
              Ver proveedores
            </Link>
          </p>
          {providerMxRowsFromDb.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-600">Sin proveedores activos o sin datos.</p>
          ) : (
            <ul className="mt-3 divide-y divide-violet-200/80 text-sm">
              {providerMxRowsFromDb.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <Link href={`/proveedores/${r.id}`} className="font-medium text-violet-950 underline">
                    {r.name}
                  </Link>
                  <span className="text-right text-xs tabular-nums text-violet-950">
                    MXN {formatMoneyDisplay(Number(r.sumMxn.toString()), FiatCurrency.MXN)} ·{" "}
                    {formatMoneyDisplay(Number(r.sumGtq.toString()), FiatCurrency.GTQ)} ·{" "}
                    {formatMoneyDisplay(Number(r.sumUsdt.toString()), "USDT")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="mt-6 rounded border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-medium text-zinc-800">Bancos (hoy)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Saldo sistema respeta saldo inicial y corte si están configurados en{" "}
          <Link href="/bancos/saldos-iniciales" className="text-blue-700 underline">
            Saldos iniciales
          </Link>
          .
        </p>
        <ul className="mt-3 space-y-4 text-sm">
          {bankPanels.map((b) => {
            const x = b.breakdown;
            const reportedStr = x.reportedBalance != null ? String(x.reportedBalance) : "";
            return (
              <li key={b.id} className="border-b border-zinc-100 pb-3 last:border-0">
                <div className="font-medium text-zinc-900">{b.label}</div>
                <dl className="mt-1 grid gap-0.5 text-xs text-zinc-700">
                  <div className="flex justify-between gap-2">
                    <dt>Saldo inicial</dt>
                    <dd className="tabular-nums">
                      {x.openingAmount != null
                        ? `${formatMoneyDisplay(x.openingAmount, b.currency)} (${x.openingEffectiveAt?.toLocaleString() ?? ""})`
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Créditos hoy</dt>
                    <dd className="tabular-nums text-emerald-800">+{formatMoneyDisplay(x.creditsToday, b.currency)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Débitos hoy</dt>
                    <dd className="tabular-nums text-red-800">−{formatMoneyDisplay(x.debitsToday, b.currency)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 font-medium text-zinc-900">
                    <dt>Saldo sistema</dt>
                    <dd className="tabular-nums">{formatMoneyDisplay(x.systemBalance, b.currency)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Saldo banco real</dt>
                    <dd className="tabular-nums">
                      {x.reportedBalance != null ? formatMoneyDisplay(x.reportedBalance, b.currency) : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Diferencia</dt>
                    <dd className="tabular-nums">
                      {x.difference != null ? formatMoneyDisplay(x.difference, b.currency) : "—"}
                    </dd>
                  </div>
                </dl>
                {canManageBanks(user) ? (
                  <div className="mt-2">
                    <ReportedBalanceForm bankAccountId={b.id} currency={b.currency} defaultValue={reportedStr} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
