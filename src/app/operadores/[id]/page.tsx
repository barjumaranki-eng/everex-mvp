import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import {
  canCreateOperatorManualAdjustment,
  canExportOperatorLedger,
  canLiquidateOperatorBankGtq,
  canManageOperatorCatalog,
  canViewOperatorLedger,
} from "@/lib/authz";
import { formatRateDisplay } from "@/lib/format-rate";
import { formatMoneyDisplay } from "@/lib/format-money";
import { FiatCurrency } from "@prisma/client";
import { OperadorAjusteForm } from "../OperadorAjusteForm";
import { OperadorPagoEverexForm } from "../OperadorPagoEverexForm";
import { OperadorRowManage } from "../OperadorRowManage";
import { getOperatorBalance, getOperatorLedgerSummary } from "@/lib/operator-ledger";
import {
  buildOperatorMajorBook,
  formatGtqCell,
  formatMxnCell,
  formatUsdtCell,
  MAJOR_BOOK_TYPE_LABEL_ES,
  parseOperatorLedgerRange,
} from "@/lib/operator-major-book";

export const dynamic = "force-dynamic";

function ledgerParamsFromSearch(
  sp: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {};
  for (const k of ["range", "day", "year", "from", "to"] as const) {
    const v = sp[k];
    if (typeof v === "string" && v) out[k] = v;
  }
  return out;
}

function exportHrefForOperator(id: string, sp: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const k of ["range", "day", "year", "from", "to"] as const) {
    const v = sp[k];
    if (typeof v === "string" && v) q.set(k, v);
  }
  const qs = q.toString();
  return `/operadores/${id}/export${qs ? `?${qs}` : ""}`;
}

export default async function OperadorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canViewOperatorLedger(user)) redirect("/dashboard");

  const { id } = await params;
  const sp = await searchParams;
  const ledgerSp = ledgerParamsFromSearch(sp);
  const { periodLabel, start, endExclusive } = parseOperatorLedgerRange(ledgerSp);

  const op = await prisma.operator.findUnique({ where: { id } });
  if (!op) notFound();

  const [book, summary, gtqBanks, opBal] = await Promise.all([
    buildOperatorMajorBook(id, start, endExclusive, periodLabel),
    getOperatorLedgerSummary(id),
    prisma.bankAccount.findMany({
      where: { active: true, currency: FiatCurrency.GTQ },
      orderBy: { label: "asc" },
      select: { id: true, label: true },
    }),
    getOperatorBalance(id),
  ]);

  const rangeVal = typeof ledgerSp.range === "string" ? ledgerSp.range : "month";
  const dayVal = typeof ledgerSp.day === "string" ? ledgerSp.day : "";
  const yearVal = typeof ledgerSp.year === "string" ? ledgerSp.year : "";
  const fromVal = typeof ledgerSp.from === "string" ? ledgerSp.from : "";
  const toVal = typeof ledgerSp.to === "string" ? ledgerSp.to : "";

  const exportHref = exportHrefForOperator(id, ledgerSp);

  const currentBal = Number(opBal.balanceGtq.toString());
  const currentUsdtBal = opBal.balanceUsdt;
  const negGlobal = currentBal < -1e-6;
  const statusArchived = !op.active;
  const statusLabel = statusArchived ? "Archivado" : negGlobal ? "Saldo negativo" : "Normal";
  const statusClass = statusArchived
    ? "border-amber-300 bg-amber-50 text-amber-950"
    : negGlobal
      ? "border-red-300 bg-red-50 text-red-900"
      : "border-emerald-200 bg-emerald-50 text-emerald-950";

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <Link href="/operadores" className="text-sm text-blue-700 underline">
        ← Operadores
      </Link>

      <header className="mt-4 rounded border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">{op.name}</h1>
            <p className="mt-2 text-sm text-zinc-600">
              Saldo actual GTQ (lo que Everex debe al operador):{" "}
              <span className={negGlobal ? "font-semibold text-red-600 tabular-nums" : "font-semibold tabular-nums text-zinc-900"}>
                {formatMoneyDisplay(currentBal, FiatCurrency.GTQ)}
              </span>
            </p>
            <p className="mt-1 text-sm text-zinc-600">
              Saldo USDT (libro operador):{" "}
              <span className="font-semibold tabular-nums text-zinc-900">
                {formatMoneyDisplay(currentUsdtBal, "USDT")}
              </span>
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              Compras USDT: se suman <code className="text-zinc-600">gtqTotal</code> y{" "}
              <code className="text-zinc-600">usdtAmount</code> si la fila tiene este operador (
              <code className="text-zinc-600">OPERATOR</code> o <code className="text-zinc-600">PROVIDER_MX</code> con
              operador asociado).
            </p>
          </div>
          <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${statusClass}`}>{statusLabel}</span>
        </div>
        {negGlobal ? (
          <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            Operador sobrepagado o falta registrar compra previa.
          </p>
        ) : null}
        {statusArchived ? (
          <p className="mt-2 text-xs text-amber-800">No aparece en formularios nuevos; el historial y saldo siguen visibles aquí.</p>
        ) : null}
        {book.partialLedger ? (
          <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Libro mayor parcial mientras se sincronizan asientos.
          </p>
        ) : null}
      </header>

      {canManageOperatorCatalog(user) ? (
        <div className="mt-4">
          <OperadorRowManage id={id} name={op.name} active={op.active} canDelete={summary.canHardDelete} />
        </div>
      ) : null}

      {canCreateOperatorManualAdjustment(user) ? <OperadorAjusteForm operatorId={id} /> : null}

      {canLiquidateOperatorBankGtq(user) ? <OperadorPagoEverexForm operatorId={id} banks={gtqBanks} /> : null}

      <section className="mt-6 rounded border border-zinc-200 bg-zinc-50/80 p-4 text-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Resumen del periodo</h2>
        <p className="mt-1 text-xs text-zinc-500">{book.periodLabel}</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs text-zinc-500">Saldo inicial GTQ</dt>
            <dd className="tabular-nums font-medium">{formatMoneyDisplay(book.openingBalanceGtq, FiatCurrency.GTQ)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Entradas del periodo (GTQ)</dt>
            <dd className="tabular-nums font-medium">{formatMoneyDisplay(book.periodTotalDebitsGtq, FiatCurrency.GTQ)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Salidas del periodo (GTQ)</dt>
            <dd className="tabular-nums font-medium">{formatMoneyDisplay(book.periodTotalCreditsGtq, FiatCurrency.GTQ)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Saldo final GTQ (periodo)</dt>
            <dd
              className={
                book.closingBalanceGtq < -1e-6 ? "tabular-nums font-medium text-red-600" : "tabular-nums font-medium"
              }
            >
              {formatMoneyDisplay(book.closingBalanceGtq, FiatCurrency.GTQ)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Total MXN comprados</dt>
            <dd className="tabular-nums font-medium">{formatMoneyDisplay(book.periodTotalMxnPurchases, FiatCurrency.MXN)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Total USDT recibidos</dt>
            <dd className="tabular-nums font-medium">{formatMoneyDisplay(book.periodTotalUsdtPurchases, "USDT")}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Pagos aplicados por clientes</dt>
            <dd className="tabular-nums font-medium">{formatMoneyDisplay(book.periodTotalClientPaymentsGtq, FiatCurrency.GTQ)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Pagos Everex al operador</dt>
            <dd className="tabular-nums font-medium">{formatMoneyDisplay(book.periodTotalEverexPaymentsGtq, FiatCurrency.GTQ)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Saldo inicial USDT (periodo)</dt>
            <dd className="tabular-nums font-medium">{formatMoneyDisplay(book.openingBalanceUsdt, "USDT")}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">USDT entrada (periodo)</dt>
            <dd className="tabular-nums font-medium">{formatMoneyDisplay(book.periodTotalUsdtEntry, "USDT")}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">USDT salida (periodo)</dt>
            <dd className="tabular-nums font-medium">{formatMoneyDisplay(book.periodTotalUsdtExit, "USDT")}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Saldo final USDT (periodo)</dt>
            <dd className="tabular-nums font-medium">{formatMoneyDisplay(book.closingBalanceUsdt, "USDT")}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded border border-zinc-200 bg-white p-3 text-sm">
        <h2 className="text-xs font-medium text-zinc-700">Filtro de fechas</h2>
        <form method="get" className="mt-3 space-y-3 text-xs">
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-1.5">
              <input type="radio" name="range" value="today" defaultChecked={rangeVal === "today"} />
              Hoy
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="range" value="week" defaultChecked={rangeVal === "week"} />
              Semana
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="range" value="month" defaultChecked={rangeVal === "month" || !ledgerSp.range} />
              Mes
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="range" value="year" defaultChecked={rangeVal === "year"} />
              Año
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="range" value="custom" defaultChecked={rangeVal === "custom"} />
              Rango personalizado
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="range" value="day" defaultChecked={rangeVal === "day"} />
              Día (fecha)
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              Día (YYYY-MM-DD)
              <input
                type="date"
                name="day"
                defaultValue={dayVal}
                className="mt-0.5 block rounded border border-zinc-300 px-2 py-1"
              />
            </label>
            <label className="block">
              Año (AAAA)
              <input
                type="number"
                name="year"
                min={2000}
                max={2100}
                placeholder="2026"
                defaultValue={yearVal}
                className="mt-0.5 block w-28 rounded border border-zinc-300 px-2 py-1"
              />
            </label>
            <label className="block">
              Desde
              <input
                type="date"
                name="from"
                defaultValue={fromVal}
                className="mt-0.5 block rounded border border-zinc-300 px-2 py-1"
              />
            </label>
            <label className="block">
              Hasta
              <input type="date" name="to" defaultValue={toVal} className="mt-0.5 block rounded border border-zinc-300 px-2 py-1" />
            </label>
            <button type="submit" className="rounded bg-zinc-900 px-3 py-1.5 text-white">
              Aplicar
            </button>
            {Object.keys(ledgerSp).length > 0 ? (
              <Link href={`/operadores/${id}`} className="text-blue-700 underline">
                Restablecer (mes en curso)
              </Link>
            ) : null}
          </div>
        </form>
        {canExportOperatorLedger(user) ? (
          <div className="mt-3">
            <a
              href={exportHref}
              className="inline-flex items-center rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
            >
              Exportar CSV
            </a>
            <span className="ml-2 text-xs text-zinc-500">Mismo periodo seleccionado arriba.</span>
          </div>
        ) : null}
      </section>

      <h2 className="mt-8 text-sm font-medium">Libro mayor</h2>
      <p className="mt-1 text-xs text-zinc-500">
        GTQ: el saldo de la primera fila incluye el saldo inicial del periodo (movimientos anteriores al rango). Cada fila:
        saldo = anterior + entrada GTQ − salida GTQ. USDT: saldo = anterior + USDT entrada − USDT salida. En filas{" "}
        <code className="text-zinc-600">OPERADOR_MXN_USDT</code>, la columna &quot;Tasa&quot; muestra el XE (MXN por
        USDT) del registro.
      </p>

      {book.rows.length === 0 ? (
        <div className="mt-3 space-y-1 text-sm text-zinc-500">
          <p>No hay movimientos en este periodo.</p>
          {Math.abs(book.openingBalanceGtq) > 1e-6 || Math.abs(book.openingBalanceUsdt) > 1e-6 ? (
            <p className="text-xs text-zinc-600">
              Saldo arrastrado al inicio del periodo: {formatMoneyDisplay(book.openingBalanceGtq, FiatCurrency.GTQ)} GTQ ·{" "}
              {formatMoneyDisplay(book.openingBalanceUsdt, "USDT")} USDT. Saldo al cierre del periodo (sin líneas):{" "}
              {formatMoneyDisplay(book.closingBalanceGtq, FiatCurrency.GTQ)} GTQ.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto rounded border border-zinc-200 bg-white">
          <table className="min-w-[1240px] w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-700">
                <th className="px-2 py-2 font-medium">Fecha registro</th>
                <th className="px-2 py-2 font-medium">Tipo</th>
                <th className="px-2 py-2 font-medium">Referencia</th>
                <th className="px-2 py-2 font-medium">Descripción</th>
                <th className="px-2 py-2 font-medium">Cliente</th>
                <th className="px-2 py-2 font-medium">Operación</th>
                <th className="px-2 py-2 font-medium">Banco</th>
                <th className="px-2 py-2 font-medium text-right">MXN</th>
                <th className="px-2 py-2 font-medium text-right">Tasa MXN→GTQ</th>
                <th className="px-2 py-2 font-medium text-right">GTQ entrada</th>
                <th className="px-2 py-2 font-medium text-right">GTQ salida</th>
                <th className="px-2 py-2 font-medium text-right">USDT entrada</th>
                <th className="px-2 py-2 font-medium text-right">USDT salida</th>
                <th className="px-2 py-2 font-medium">Usuario</th>
                <th className="px-2 py-2 font-medium text-right">Saldo GTQ</th>
                <th className="px-2 py-2 font-medium text-right">Saldo USDT</th>
              </tr>
            </thead>
            <tbody>
              {book.rows.map((r) => {
                const rowNeg = r.periodRunningGtq < -1e-6;
                const rowNegUsdt = r.periodRunningUsdt < -1e-6;
                return (
                  <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50/80">
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-zinc-800">
                      {r.postedAt.toLocaleString("es-GT", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <span className="font-mono text-[11px] text-zinc-800" title={MAJOR_BOOK_TYPE_LABEL_ES[r.displayType]}>
                        {r.displayType}
                      </span>
                    </td>
                    <td className="max-w-[140px] truncate px-2 py-1.5 font-mono text-[11px] text-zinc-600" title={r.reference}>
                      {r.reference}
                    </td>
                    <td className="max-w-[220px] px-2 py-1.5 text-zinc-600" title={r.description}>
                      {r.description}
                    </td>
                    <td className="max-w-[120px] truncate px-2 py-1.5 text-zinc-700" title={r.clientName ?? ""}>
                      {r.clientName ?? "—"}
                    </td>
                    <td className="max-w-[100px] truncate px-2 py-1.5 font-mono text-zinc-600" title={r.operationRef ?? ""}>
                      {r.operationRef ?? "—"}
                    </td>
                    <td className="max-w-[100px] truncate px-2 py-1.5 text-zinc-600" title={r.bankHint ?? ""}>
                      {r.bankHint ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{formatMxnCell(r.mxn)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-zinc-600">
                      {r.rateMxnGtq != null
                        ? r.displayType === "OPERADOR_MXN_USDT"
                          ? formatRateDisplay(r.rateMxnGtq)
                          : r.rateMxnGtq.toString()
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{formatGtqCell(r.gtqDebit)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{formatGtqCell(r.gtqCredit)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{formatUsdtCell(r.usdtEntry)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{formatUsdtCell(r.usdtExit)}</td>
                    <td className="max-w-[120px] truncate px-2 py-1.5 text-zinc-600" title={r.userLabel}>
                      {r.userLabel}
                    </td>
                    <td
                      className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums font-medium ${
                        rowNeg ? "text-red-600" : "text-zinc-900"
                      }`}
                    >
                      {formatMoneyDisplay(r.periodRunningGtq, FiatCurrency.GTQ)}
                    </td>
                    <td
                      className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums font-medium ${
                        rowNegUsdt ? "text-red-600" : "text-zinc-900"
                      }`}
                    >
                      {formatMoneyDisplay(r.periodRunningUsdt, "USDT")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
