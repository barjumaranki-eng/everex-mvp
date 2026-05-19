import Link from "next/link";
import { FiatCurrency } from "@prisma/client";
import { formatMoneyDisplay } from "@/lib/format-money";
import { formatRateDisplay } from "@/lib/format-rate";
import { OPERATIONAL_DASHBOARD_PROOF_DAYS, type OperationalDashboardSnapshot } from "@/lib/operational-dashboard";
import type { OperatorBalanceRow } from "@/lib/operator-ledger";

type Props = {
  data: OperationalDashboardSnapshot;
  operatorBalances: OperatorBalanceRow[];
  /** OPERACIONES: ocultar deudas, clientes deudores y conciliación bancaria. */
  hideTreasuryModules?: boolean;
};

export function OperationalDashboard({ data, operatorBalances, hideTreasuryModules = false }: Props) {
  const {
    dayKey,
    operacionesPendientes,
    ventasSinReparto,
    spreadReciente,
    bancosConciliar,
    pagosPendientes,
    alertasDiferencia,
    clientesDeudoresActivos,
    sinSoporte,
    inventoryUsdt,
    inventoryAvgGtqPerUsdt,
    purchasesOperatorTodayGtq,
    purchasesOperatorTodayUsdt,
    purchasesProviderMxTodayUsdt,
    gastos,
  } = data;

  const pendientesAccion = operacionesPendientes.filter((o) => o.accion === "falta_reparto").length;
  const totalSinConciliar = bancosConciliar.reduce(
    (a, b) => a + b.lineasPendientes + b.movimientosPendientes,
    0,
  );
  const totalSinSoporte =
    sinSoporte.gastos + sinSoporte.pagosCliente + sinSoporte.pagosDeuda + sinSoporte.movBancoSinReferencia;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-lg font-semibold text-zinc-900">Dashboard operativo</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Tareas y colas del día ({dayKey}). Inventario y compras del día se calculan desde los mismos registros que
        inventario global y libro de operadores.
      </p>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded border border-emerald-200 bg-emerald-50/60 p-4 text-sm">
          <h2 className="font-medium text-emerald-950">Inventario USDT (sistema)</h2>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-950">
            {formatMoneyDisplay(inventoryUsdt, "USDT")}
          </p>
          <p className="mt-1 text-xs text-emerald-900/90">
            Costo prom. {formatRateDisplay(inventoryAvgGtqPerUsdt)} GTQ/USDT · incluye todas las compras USDT y ventas
            OTC registradas.
          </p>
          <p className="mt-2 text-xs">
            <Link href="/compras-usdt" className="font-medium text-emerald-900 underline">
              Compras USDT
            </Link>
          </p>
        </div>
        <div className="rounded border border-sky-200 bg-sky-50/70 p-4 text-sm">
          <h2 className="font-medium text-sky-950">Compras hoy · operador</h2>
          <p className="mt-2 tabular-nums text-lg font-semibold text-sky-950">
            {formatMoneyDisplay(purchasesOperatorTodayUsdt, "USDT")}
          </p>
          <p className="mt-1 text-xs text-sky-900/90">
            GTQ registrados hoy: {formatMoneyDisplay(purchasesOperatorTodayGtq, FiatCurrency.GTQ)}. Incluye{" "}
            <code className="text-sky-900">OPERATOR</code> y <code className="text-sky-900">PROVIDER_MX</code> con
            operador asociado.
          </p>
        </div>
        <div className="rounded border border-violet-200 bg-violet-50/60 p-4 text-sm">
          <h2 className="font-medium text-violet-950">Compras hoy · proveedor MX</h2>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-violet-950">
            {formatMoneyDisplay(purchasesProviderMxTodayUsdt, "USDT")}
          </p>
          <p className="mt-1 text-xs text-violet-900/90">
            Todas las compras con contraparte proveedor MX hoy (flujo MX / inventario). Si llevan operador asociado,
            también cuentan en la tarjeta de operador.
          </p>
        </div>
      </section>

      <section className="mt-6 rounded border border-orange-200 bg-orange-50/50 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium text-orange-950">Gastos operativos</h2>
          <Link href="/gastos" className="text-xs font-medium text-orange-900 underline">
            Ver / registrar gastos
          </Link>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded border border-orange-100 bg-white/80 p-3">
            <p className="text-xs text-zinc-600">Hoy (GTQ)</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">
              {formatMoneyDisplay(gastos.todayGtq, FiatCurrency.GTQ)}
            </p>
          </div>
          <div className="rounded border border-orange-100 bg-white/80 p-3">
            <p className="text-xs text-zinc-600">Mes (GTQ)</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">
              {formatMoneyDisplay(gastos.monthGtq, FiatCurrency.GTQ)}
            </p>
          </div>
        </div>
        {gastos.recent.length === 0 ? (
          <p className="mt-3 text-xs text-orange-900/80">Sin gastos registrados aún.</p>
        ) : (
          <ul className="mt-3 divide-y divide-orange-100 text-xs">
            {gastos.recent.map((g) => (
              <li key={g.id} className="flex flex-wrap justify-between gap-2 py-2">
                <div className="min-w-0">
                  <span className="font-medium text-zinc-900">{g.category}</span>
                  <span className="ml-2 text-zinc-600">{g.dayKey}</span>
                  {g.bankLabel ? <span className="ml-2 text-zinc-500">· {g.bankLabel}</span> : null}
                  {g.reference ? (
                    <p className="mt-0.5 truncate text-zinc-500" title={g.reference}>
                      Ref: {g.reference}
                    </p>
                  ) : null}
                  <p className="text-zinc-400">{g.userLabel}</p>
                </div>
                <span className="shrink-0 tabular-nums font-medium text-zinc-900">
                  {formatMoneyDisplay(g.amount, g.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {gastos.bankSaldos.length > 0 ? (
        <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {gastos.bankSaldos.map((b) => (
            <div key={b.bankAccountId} className="rounded border border-zinc-200 bg-white p-3 text-sm">
              <h3 className="font-medium text-zinc-800">{b.label}</h3>
              <p className="mt-1 text-xs text-zinc-500">{b.currency} · saldo sistema</p>
              <p className="mt-2 text-lg font-semibold tabular-nums text-zinc-900">
                {formatMoneyDisplay(b.systemBalance, b.currency)}
              </p>
            </div>
          ))}
        </section>
      ) : null}

      <section className="mt-6 rounded border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-medium text-zinc-800">Saldos operadores (libro interno, histórico)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          <code className="text-zinc-600">UsdtPurchase</code> con <code className="text-zinc-600">counterparty = OPERATOR</code>{" "}
          o <code className="text-zinc-600">PROVIDER_MX</code> con <code className="text-zinc-600">operatorId</code>{" "}
          suman GTQ/USDT; reparto OTC al operador en USDT suma USDT; liquidaciones MXN→USDT restan{" "}
          <code className="text-zinc-600">usdtPaid</code> en USDT y, si hay tasa <code className="text-zinc-600">gtqRateOptional</code>,{" "}
          <code className="text-zinc-600">usdtPaid × tasa</code> en GTQ. Compras proveedor MX sin operador no aparecen aquí.{" "}
          <Link href="/proveedores" className="text-blue-700 underline">
            Proveedores MX
          </Link>{" "}
          van aparte.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          GTQ y USDT según los mismos criterios que el dashboard financiero.{" "}
          <Link href="/operadores" className="text-blue-700 underline">
            Ver operadores
          </Link>
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          {operatorBalances.length === 0 ? (
            <li className="text-xs text-zinc-500">Sin operadores o no se pudieron cargar saldos.</li>
          ) : (
            operatorBalances.map((o) => (
              <li key={o.id} className="flex flex-wrap justify-between gap-2 border-b border-zinc-100 py-1">
                <span className="text-zinc-800">{o.name}</span>
                <span className="text-right text-xs tabular-nums">
                  <span className="block font-medium">{formatMoneyDisplay(o.balanceGtq, FiatCurrency.GTQ)}</span>
                  <span className="block text-zinc-500">{formatMoneyDisplay(o.balanceUsdt, "USDT")}</span>
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-zinc-200 bg-white p-3 text-sm">
          <h2 className="font-medium text-zinc-800">1. Operaciones (mesa) a revisar</h2>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-amber-900">{pendientesAccion}</p>
          <p className="mt-1 text-xs text-zinc-600">Con reparto GTQ incompleto o faltante (ventas cliente).</p>
        </div>
        {!hideTreasuryModules ? (
          <div className="rounded border border-zinc-200 bg-white p-3 text-sm">
            <h2 className="font-medium text-zinc-800">3. Banco / conciliación</h2>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900">{totalSinConciliar}</p>
            <p className="mt-1 text-xs text-zinc-600">Líneas de extracto + movimientos pendientes de conciliar.</p>
          </div>
        ) : null}
        {!hideTreasuryModules ? (
          <div className="rounded border border-zinc-200 bg-white p-3 text-sm">
            <h2 className="font-medium text-zinc-800">4. Pagos / cuentas activas</h2>
            <p className="mt-2 text-xs text-zinc-600">
              Por cobrar activas:{" "}
              <span className="font-semibold tabular-nums text-zinc-900">{pagosPendientes.cuentasPorCobrar}</span>
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              Deudas Everex activas:{" "}
              <span className="font-semibold tabular-nums text-zinc-900">{pagosPendientes.deudasEverex}</span>
            </p>
          </div>
        ) : null}
        <div className="rounded border border-zinc-200 bg-white p-3 text-sm">
          <h2 className="font-medium text-zinc-800">5. Alertas saldo banco vs sistema</h2>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-red-900">{alertasDiferencia.length}</p>
          <p className="mt-1 text-xs text-zinc-600">Cuentas con diferencia (revisar en Bancos).</p>
        </div>
        {!hideTreasuryModules ? (
          <div className="rounded border border-zinc-200 bg-white p-3 text-sm">
            <h2 className="font-medium text-zinc-800">6. Clientes deudores</h2>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900">{clientesDeudoresActivos}</p>
            <p className="mt-1 text-xs">
              <Link href="/clientes-deudores" className="text-blue-700 underline">
                Ir a clientes deudores
              </Link>
            </p>
          </div>
        ) : null}
        <div className="rounded border border-zinc-200 bg-white p-3 text-sm">
          <h2 className="font-medium text-zinc-800">8. Registros sin soporte</h2>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900">{totalSinSoporte}</p>
          <p className="mt-1 text-xs text-zinc-600">
            Gastos / pagos sin imagen · mov. banco sin referencia (últimos {OPERATIONAL_DASHBOARD_PROOF_DAYS} días).
          </p>
        </div>
      </section>

      <section className="mt-6 rounded border border-amber-200 bg-amber-50/50 p-4 text-sm">
        <h2 className="font-medium text-amber-950">2. Ventas pendientes de reparto</h2>
        {ventasSinReparto.length === 0 ? (
          <p className="mt-2 text-xs text-amber-900/90">Ninguna venta GTQ reciente sin reparto completo.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {ventasSinReparto.map((v) => (
              <li key={v.id}>
                <Link href={`/operaciones/${v.id}`} className="text-blue-800 underline">
                  {v.ref.slice(0, 8)}…
                </Link>{" "}
                <span className="text-zinc-700">{v.clientName}</span>
                <span className="text-xs text-amber-800"> — completar reparto</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded border border-zinc-200 bg-white p-4 text-sm">
        <h2 className="font-medium text-zinc-800">7. Operaciones mesa recientes (sin montos)</h2>
        <ul className="mt-2 divide-y divide-zinc-100">
          {operacionesPendientes.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <Link href={`/operaciones/${o.id}`} className="font-mono text-xs text-blue-700 underline">
                  {o.ref.slice(0, 8)}
                </Link>
                <span className="ml-2 text-zinc-800">{o.clientName}</span>
              </div>
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  o.accion === "falta_reparto" ? "bg-amber-100 text-amber-950" : "bg-zinc-100 text-zinc-700"
                }`}
              >
                {o.accion === "falta_reparto" ? "Falta reparto" : "Reparto OK"}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-zinc-500">
          <Link href="/operaciones" className="text-blue-700 underline">
            Ver todas las operaciones
          </Link>
        </p>
      </section>

      <section className="mt-6 rounded border border-violet-200 bg-violet-50/40 p-4 text-sm">
        <h2 className="font-medium text-violet-950">Operaciones spread MXN recientes</h2>
        {spreadReciente.length === 0 ? (
          <p className="mt-2 text-xs text-violet-900/80">Sin spreads recientes.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {spreadReciente.map((s) => (
              <li key={s.id}>
                <Link href={`/operaciones/mxn-spread/${s.id}`} className="text-violet-900 underline">
                  {s.ref.slice(0, 8)}…
                </Link>{" "}
                <span className="text-zinc-800">{s.clientName}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!hideTreasuryModules ? (
        <section className="mt-6 rounded border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="font-medium text-zinc-800">3. Bancos — cola de conciliación (conteos)</h2>
          <ul className="mt-2 space-y-2">
            {bancosConciliar.map((b) => (
              <li key={b.bankAccountId} className="flex flex-wrap justify-between gap-2 border-b border-zinc-100 py-2 text-xs">
                <span className="font-medium text-zinc-900">{b.label}</span>
                <span className="text-zinc-600">
                  Extracto pendiente: {b.lineasPendientes} · Mov. pendiente: {b.movimientosPendientes}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs">
            <Link href="/conciliacion-bancaria" className="text-blue-700 underline">
              Ir a conciliación bancaria
            </Link>{" "}
            ·{" "}
            <Link href="/bancos" className="text-blue-700 underline">
              Bancos
            </Link>
          </p>
        </section>
      ) : null}

      {alertasDiferencia.length > 0 ? (
        <section className="mt-6 rounded border border-red-200 bg-red-50/60 p-4 text-sm">
          <h2 className="font-medium text-red-950">Alertas de diferencias (cuenta)</h2>
          <ul className="mt-2 list-inside list-disc text-xs text-red-900">
            {alertasDiferencia.map((a) => (
              <li key={a.label}>{a.label} — revisar saldo reportado vs sistema</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 rounded border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-700">
        <h2 className="font-medium text-zinc-900">8. Detalle sin soporte / referencia</h2>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>Gastos sin imagen: {sinSoporte.gastos}</li>
          {!hideTreasuryModules ? (
            <>
              <li>Pagos a deudores sin imagen: {sinSoporte.pagosCliente}</li>
              <li>Pagos de deuda Everex sin imagen: {sinSoporte.pagosDeuda}</li>
            </>
          ) : null}
          <li>Movimientos bancarios sin referencia: {sinSoporte.movBancoSinReferencia}</li>
        </ul>
        <p className="mt-2">
          <Link href="/gastos" className="text-blue-700 underline">
            Gastos
          </Link>
          {" · "}
          <Link href="/bancos" className="text-blue-700 underline">
            Bancos
          </Link>
        </p>
      </section>
    </main>
  );
}
