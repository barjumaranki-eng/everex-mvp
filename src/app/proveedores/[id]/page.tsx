import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PurchaseCounterparty, StmtEntityKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { formatMoneyDisplay } from "@/lib/format-money";
import { formatRateDisplay } from "@/lib/format-rate";
import { FiatCurrency } from "@prisma/client";
import { getProviderMxBalancesFromDb } from "@/lib/provider-mx-balances";

export default async function ProveedorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const p = await prisma.mexicoProvider.findUnique({ where: { id } });
  if (!p) notFound();

  const [purchases, stmt, totalsFromPurchases] = await Promise.all([
    prisma.usdtPurchase.findMany({
      where: { providerId: id, counterparty: PurchaseCounterparty.PROVIDER_MX },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    prisma.statementEntry.findMany({
      where: { entityKind: StmtEntityKind.PROVIDER_MX, providerId: id },
      orderBy: { postedAt: "desc" },
      take: 50,
    }),
    getProviderMxBalancesFromDb(id),
  ]);

  const balStmt = await prisma.statementEntry.aggregate({
    where: { entityKind: StmtEntityKind.PROVIDER_MX, providerId: id },
    _sum: { amountGtq: true },
  });
  const balStmtNum = Number(balStmt._sum.amountGtq?.toString() ?? "0");

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/proveedores" className="text-sm text-blue-700 underline">
        ← Proveedor MX
      </Link>
      <h1 className="mt-4 text-lg font-semibold">{p.name}</h1>

      <p className="mt-2 text-xs text-zinc-600">
        Acumulado de <code className="text-zinc-700">UsdtPurchase</code> con{" "}
        <code className="text-zinc-700">counterparty = PROVIDER_MX</code> y este proveedor. Si la compra tiene{" "}
        <code className="text-zinc-700">operatorId</code>, los mismos montos también figuran en el libro de ese
        operador. Las compras solo <code className="text-zinc-700">OPERATOR</code> están en{" "}
        <Link href="/operadores" className="text-blue-700 underline">
          Operadores
        </Link>
        .
      </p>

      <section className="mt-4 rounded border border-violet-200 bg-violet-50/60 p-4 text-sm">
        <h2 className="font-medium text-violet-950">Totales desde UsdtPurchase (PROVIDER_MX)</h2>
        <dl className="mt-2 space-y-1 tabular-nums text-violet-950">
          <div className="flex justify-between gap-4">
            <dt className="text-violet-900/90">MXN (amountMxn)</dt>
            <dd>{formatMoneyDisplay(Number(totalsFromPurchases.sumMxn.toString()), FiatCurrency.MXN)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-violet-900/90">GTQ total</dt>
            <dd>{formatMoneyDisplay(Number(totalsFromPurchases.sumGtq.toString()), FiatCurrency.GTQ)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-violet-900/90">USDT total</dt>
            <dd>{formatMoneyDisplay(Number(totalsFromPurchases.sumUsdt.toString()), "USDT")}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-violet-900/80">
          Saldo GTQ en StatementEntry (auxiliar): {formatMoneyDisplay(balStmtNum, FiatCurrency.GTQ)}
        </p>
      </section>

      {p.notes ? <p className="mt-4 text-sm">{p.notes}</p> : null}

      <h2 className="mt-6 text-sm font-medium">Libro compras USDT (UsdtPurchase)</h2>
      <div className="mt-2 overflow-x-auto rounded border border-zinc-200 bg-white text-xs">
        <table className="min-w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-[11px] text-zinc-600">
              <th className="p-2">Fecha</th>
              <th className="p-2">Tipo</th>
              <th className="p-2 text-right">MXN</th>
              <th className="p-2 text-right">GTQ</th>
              <th className="p-2 text-right">USDT</th>
              <th className="p-2 text-right">XE</th>
              <th className="p-2 text-right">MXN→GTQ</th>
              <th className="p-2 font-mono">Ref.</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((x) => (
              <tr key={x.id} className="border-b border-zinc-100">
                <td className="p-2 whitespace-nowrap">{x.createdAt.toLocaleString()}</td>
                <td className="p-2">COMPRA_USDT</td>
                <td className="p-2 text-right tabular-nums">
                  {x.amountMxn != null ? formatMoneyDisplay(x.amountMxn, FiatCurrency.MXN) : "—"}
                </td>
                <td className="p-2 text-right tabular-nums">{formatMoneyDisplay(x.gtqTotal, FiatCurrency.GTQ)}</td>
                <td className="p-2 text-right tabular-nums">{formatMoneyDisplay(x.usdtAmount, "USDT")}</td>
                <td className="p-2 text-right tabular-nums">
                  {x.rateXe != null ? formatRateDisplay(x.rateXe) : "—"}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {x.rateMxnToGtq != null ? formatRateDisplay(x.rateMxnToGtq) : "—"}
                </td>
                <td className="max-w-[100px] truncate p-2 font-mono text-[10px]">{x.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-6 text-sm font-medium">Movimientos estado de cuenta (StatementEntry, auxiliar)</h2>
      <ul className="mt-2 text-sm">
        {stmt.length === 0 ? <li className="text-xs text-zinc-500">Sin asientos.</li> : null}
        {stmt.map((s) => (
          <li key={s.id} className="border-b border-zinc-100 py-1">
            {s.postedAt.toLocaleString()} · {s.label} · {formatMoneyDisplay(s.amountGtq, FiatCurrency.GTQ)}
          </li>
        ))}
      </ul>
    </main>
  );
}
