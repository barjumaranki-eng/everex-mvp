import Link from "next/link";
import { redirect } from "next/navigation";
import { FiatCurrency } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canViewEstadoFinanciero } from "@/lib/authz";
import { getFinancialSummary } from "@/lib/financial-summary";
import { parseRangeFromSearch } from "@/lib/day-range";
import { formatMoneyDisplay } from "@/lib/format-money";
import { EST_GTQ_PER_USD } from "@/lib/fx";
import { OtcSide, StmtEntityKind } from "@prisma/client";
import { computeInventoryFromDb } from "@/lib/inventory";
import { getBankBalanceBreakdown } from "@/lib/bank-balance";
import { BackfillOtcLedgerForm } from "./BackfillOtcLedgerForm";

export default async function EstadoFinancieroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canViewEstadoFinanciero(user)) redirect("/dashboard");

  const sp = await searchParams;
  const { start, end, mode } = parseRangeFromSearch(sp);
  const s = await getFinancialSummary(start, end);
  const inv = await computeInventoryFromDb();

  const [opStmt, bankAccountsSimple] = await Promise.all([
    prisma.statementEntry.findMany({
      where: { entityKind: StmtEntityKind.OPERATOR },
      select: { operatorId: true, amountGtq: true },
    }),
    prisma.bankAccount.findMany({
      where: { active: true },
      orderBy: { label: "asc" },
    }),
  ]);

  const opBal = new Map<string, number>();
  for (const e of opStmt) {
    if (!e.operatorId) continue;
    opBal.set(e.operatorId, (opBal.get(e.operatorId) ?? 0) + Number(e.amountGtq.toString()));
  }
  const operators = await prisma.operator.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  const bankNet = await Promise.all(
    bankAccountsSimple.map(async (acc) => {
      const br = await getBankBalanceBreakdown(acc.id, end);
      return { label: acc.label, currency: acc.currency, bal: br.systemBalance };
    }),
  );

  const ventasUsdtRango = await prisma.otcOperation.aggregate({
    where: {
      dayKey: { gte: start, lte: end },
      side: OtcSide.CLIENT_BUYS_USDT,
    },
    _sum: { usdtAmount: true },
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/dashboard" className="text-sm text-blue-700 underline">
        ← Dashboard
      </Link>
      <h1 className="mt-4 text-lg font-semibold">Estado financiero</h1>
      <p className="text-sm text-zinc-600">Solo administración. Rango: {start} → {end}</p>

      <form className="mt-4 flex flex-wrap items-end gap-2 text-sm" method="get">
        <label>
          Vista
          <select name="range" defaultValue={mode} className="ml-1 rounded border border-zinc-400 px-2 py-1">
            <option value="day">Día</option>
            <option value="week">Semana</option>
            <option value="month">Mes</option>
            <option value="custom">Personalizado</option>
          </select>
        </label>
        <label>
          Día (si vista = día)
          <input name="day" type="date" className="ml-1 rounded border border-zinc-400 px-2 py-1" />
        </label>
        <label>
          Desde
          <input name="from" type="date" className="ml-1 rounded border border-zinc-400 px-2 py-1" />
        </label>
        <label>
          Hasta
          <input name="to" type="date" className="ml-1 rounded border border-zinc-400 px-2 py-1" />
        </label>
        <button type="submit" className="rounded bg-zinc-900 px-3 py-2 text-white">
          Aplicar
        </button>
      </form>

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="font-medium">OTC — utilidad GTQ</h2>
          <p className="mt-1 text-xl tabular-nums text-emerald-900">{formatMoneyDisplay(s.otcGrossGtq, FiatCurrency.GTQ)}</p>
        </div>
        <div className="rounded border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="font-medium">OTC — utilidad USDT (mesa)</h2>
          <p className="mt-1 text-xl tabular-nums text-emerald-900">{formatMoneyDisplay(s.otcProfitUsdt, "USDT")}</p>
        </div>
        <div className="rounded border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="font-medium">OTC MXN Spread — utilidad USDT</h2>
          <p className="mt-1 text-xl tabular-nums text-emerald-900">{formatMoneyDisplay(s.mxnSpreadProfitUsdt, "USDT")}</p>
        </div>
        <div className="rounded border border-zinc-200 bg-white p-4 text-sm sm:col-span-2">
          <h2 className="font-medium">OTC — bruta combinada (equiv. GTQ)</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Suma: utilidad GTQ + utilidad USDT × {EST_GTQ_PER_USD} (estimación fija, mismo criterio que el mini estado).
          </p>
          <p className="mt-1 text-xl tabular-nums text-emerald-900">{formatMoneyDisplay(s.otcGrossCombinedGtq, FiatCurrency.GTQ)}</p>
        </div>
        <div className="rounded border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="font-medium">Gastos (GTQ)</h2>
          <p className="mt-1 text-xl tabular-nums text-red-900">{formatMoneyDisplay(s.expensesGtq, FiatCurrency.GTQ)}</p>
        </div>
        <div className="rounded border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="font-medium">Pagos deuda Everex (GTQ)</h2>
          <p className="mt-1 text-xl tabular-nums">{formatMoneyDisplay(s.debtPaymentsGtq, FiatCurrency.GTQ)}</p>
        </div>
        <div className="rounded border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="font-medium">Recuperaciones deudores (GTQ)</h2>
          <p className="mt-1 text-xl tabular-nums text-blue-900">{formatMoneyDisplay(s.recoveriesGtq, FiatCurrency.GTQ)}</p>
        </div>
        <div className="rounded border border-zinc-200 bg-white p-4 text-sm sm:col-span-2">
          <h2 className="font-medium">Utilidad neta (bruta combinada − gastos − pagos deuda)</h2>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoneyDisplay(s.netOperatingGtq, FiatCurrency.GTQ)}</p>
          <p className="mt-1 text-xs text-zinc-500">
            + recuperaciones (efecto caja, no en fórmula anterior): {formatMoneyDisplay(s.recoveriesGtq, FiatCurrency.GTQ)} → delta
            caja estimado: {formatMoneyDisplay(s.cashDeltaGtq, FiatCurrency.GTQ)}
          </p>
        </div>
      </section>

      <section className="mt-6 rounded border border-zinc-200 bg-white p-4 text-sm">
        <h2 className="font-medium">Inventario USDT</h2>
        <p className="mt-1 tabular-nums">
          {formatMoneyDisplay(inv.usdt, "USDT")} · costo prom. {inv.avgGtqPerUsdt.toFixed(4)} GTQ/USDT
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          USDT vendidos en rango: {formatMoneyDisplay(Number(ventasUsdtRango._sum.usdtAmount?.toString() ?? "0"), "USDT")}
        </p>
      </section>

      <section className="mt-6 rounded border border-zinc-200 bg-white p-4 text-sm">
        <h2 className="font-medium">Saldos operadores (GTQ)</h2>
        <ul className="mt-2 space-y-1">
          {operators.map((o) => (
            <li key={o.id} className="flex justify-between border-b border-zinc-100 py-1">
              <span>{o.name}</span>
              <span className="tabular-nums">{formatMoneyDisplay(opBal.get(o.id) ?? 0, FiatCurrency.GTQ)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded border border-zinc-200 bg-white p-4 text-sm">
        <h2 className="font-medium">Bancos (saldo sistema)</h2>
        <p className="mt-1 text-xs text-zinc-500">Incluye saldo inicial desde corte si está configurado.</p>
        <ul className="mt-2 space-y-1">
          {bankNet.map((b, i) => (
            <li key={i} className="flex justify-between border-b border-zinc-100 py-1">
              <span>{b.label}</span>
              <span className="tabular-nums">{formatMoneyDisplay(b.bal, b.currency)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded border border-zinc-200 bg-white p-4 text-sm">
        <h2 className="font-medium">Herramientas</h2>
        <BackfillOtcLedgerForm />
      </section>

      <section className="mt-6 rounded border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
        <p>
          Totales en GTQ para utilidad neta. Operaciones en otras monedas no se convierten automáticamente. Pendientes
          por cobrar / deudas Everex (GTQ): {formatMoneyDisplay(s.pendingReceivablesGtq, FiatCurrency.GTQ)} /{" "}
          {formatMoneyDisplay(s.pendingPayablesGtq, FiatCurrency.GTQ)}. Anticipos cliente (venta parcial, no utilidad):{" "}
          {formatMoneyDisplay(s.pendingClientAdvancesGtq, FiatCurrency.GTQ)}.
        </p>
      </section>
    </main>
  );
}
