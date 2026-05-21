import Link from "next/link";
import { redirect } from "next/navigation";
import { WalletMovimientoTipo } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { canViewWallet } from "@/lib/authz";
import { formatMoneyDisplay } from "@/lib/format-money";
import { formatRateDisplay } from "@/lib/format-rate";
import {
  backfillWalletMovimientosFromDb,
  EMPTY_WALLET_SUMMARY,
  emptyWalletLedgerPage,
  loadWalletLedgerPage,
  loadWalletSummary,
  origenLabel,
  type WalletLedgerPage,
  type WalletSummary,
} from "@/lib/wallet-ledger";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

export default async function WalletPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  let user;
  try {
    user = await getSessionUser();
  } catch (err) {
    console.error("[wallet] getSessionUser", err);
    redirect("/login");
  }

  if (!user) redirect("/login");
  if (!canViewWallet(user)) {
    redirect("/dashboard?error=" + encodeURIComponent("Sin acceso a Wallet USDT"));
  }

  let page = 1;
  try {
    const sp = (await searchParams) ?? {};
    const pageRaw = typeof sp.page === "string" ? Number(sp.page) : 1;
    page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  } catch (err) {
    console.error("[wallet] searchParams", err);
  }

  let summary: WalletSummary = EMPTY_WALLET_SUMMARY;
  let ledger: WalletLedgerPage = emptyWalletLedgerPage(PAGE_SIZE, page);
  let loadError: string | null = null;

  try {
    await backfillWalletMovimientosFromDb();
    const [summaryResult, ledgerResult] = await Promise.all([
      loadWalletSummary(),
      loadWalletLedgerPage(page, PAGE_SIZE),
    ]);
    summary = summaryResult;
    ledger = ledgerResult;
  } catch (err) {
    console.error("[wallet] load", err);
    loadError =
      "No se pudo cargar el libro wallet (base de datos o migración pendiente). Los saldos pueden estar incompletos.";
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-lg font-semibold text-zinc-900">Wallet USDT — estado de cuenta</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Libro mayor de inventario USDT. Cada compra, venta OTC y pago a operador genera una línea automática.
      </p>

      {loadError ? (
        <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {loadError}
        </p>
      ) : null}

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded border border-emerald-200 bg-emerald-50/70 p-4">
          <h2 className="text-xs font-medium uppercase tracking-wide text-emerald-900/80">Saldo actual USDT</h2>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-950">
            {formatMoneyDisplay(summary.saldoUsdt, "USDT")}
          </p>
          <p className="mt-1 text-xs text-emerald-900/85">
            Entradas {formatMoneyDisplay(summary.totalEntradas, "USDT")} − salidas{" "}
            {formatMoneyDisplay(summary.totalSalidas, "USDT")}
          </p>
        </div>
        <div className="rounded border border-sky-200 bg-sky-50/70 p-4">
          <h2 className="text-xs font-medium uppercase tracking-wide text-sky-900/80">Costo prom. vigente</h2>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-sky-950">
            {formatRateDisplay(summary.avgGtqPerUsdt)}
          </p>
          <p className="mt-1 text-xs text-sky-900/85">GTQ/USDT (entradas con costo en GTQ)</p>
        </div>
        <div className="rounded border border-zinc-200 bg-white p-4">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-600">Movimientos</h2>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900">{summary.movimientoCount}</p>
          <p className="mt-1 text-xs text-zinc-500">Registros en libro wallet</p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-zinc-800">Historial</h2>
        {ledger.rows.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Sin movimientos registrados.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded border border-zinc-200 bg-white">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-600">
                  <th className="p-2 whitespace-nowrap">Fecha</th>
                  <th className="p-2">Tipo</th>
                  <th className="p-2">Origen</th>
                  <th className="p-2 text-right">Monto USDT</th>
                  <th className="p-2 text-right">Saldo remanente</th>
                </tr>
              </thead>
              <tbody>
                {ledger.rows.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-100">
                    <td className="p-2 whitespace-nowrap text-xs text-zinc-600">
                      <div>{r.createdAt.toLocaleString("es-GT")}</div>
                      <div className="text-zinc-400">{r.dayKey}</div>
                    </td>
                    <td className="p-2">
                      <span
                        className={
                          r.tipo === WalletMovimientoTipo.ENTRADA
                            ? "font-medium text-emerald-800"
                            : "font-medium text-red-800"
                        }
                      >
                        {r.tipo === WalletMovimientoTipo.ENTRADA ? "Entrada" : "Salida"}
                      </span>
                    </td>
                    <td className="p-2">
                      <div className="font-medium text-zinc-800">{r.etiqueta}</div>
                      <div className="text-xs text-zinc-500">{origenLabel(r.origen)}</div>
                    </td>
                    <td
                      className={`p-2 text-right tabular-nums font-medium ${
                        r.signedUsdt >= 0 ? "text-emerald-900" : "text-red-900"
                      }`}
                    >
                      {r.signedUsdt >= 0 ? "+" : "−"}
                      {formatMoneyDisplay(Math.abs(r.signedUsdt), "USDT")}
                    </td>
                    <td className="p-2 text-right tabular-nums font-semibold text-zinc-900">
                      {formatMoneyDisplay(r.saldoRemanente, "USDT")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {ledger.totalPages > 1 ? (
          <nav className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            {ledger.page > 1 ? (
              <Link className="text-blue-700 underline" href={`/wallet?page=${ledger.page - 1}`}>
                ← Anterior
              </Link>
            ) : (
              <span className="text-zinc-400">← Anterior</span>
            )}
            <span className="text-zinc-600">
              Página {ledger.page} de {ledger.totalPages} ({ledger.total} movimientos)
            </span>
            {ledger.page < ledger.totalPages ? (
              <Link className="text-blue-700 underline" href={`/wallet?page=${ledger.page + 1}`}>
                Siguiente →
              </Link>
            ) : (
              <span className="text-zinc-400">Siguiente →</span>
            )}
          </nav>
        ) : null}
      </section>

      <p className="mt-6 text-xs text-zinc-500">
        <Link href="/dashboard" className="text-blue-700 underline">
          ← Dashboard
        </Link>
        {" · "}
        <Link href="/compras-usdt" className="text-blue-700 underline">
          Compras USDT
        </Link>
      </p>
    </main>
  );
}
