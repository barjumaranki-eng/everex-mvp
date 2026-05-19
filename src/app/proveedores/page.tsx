import Link from "next/link";
import { redirect } from "next/navigation";
import { PurchaseCounterparty } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canRunOperations } from "@/lib/authz";
import { todayDayKey } from "@/lib/day-key";
import { formatMoneyDisplay } from "@/lib/format-money";
import { FiatCurrency } from "@prisma/client";
import { ProveedorAltaForm } from "./ProveedorAltaForm";
import { loadProviderMxBalanceRowsFromDb } from "@/lib/provider-mx-balances";

export default async function ProveedoresPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const dayKey = todayDayKey();
  const [providers, purchasesToday, purchasesAll, balancesFromPurchases] = await Promise.all([
    prisma.mexicoProvider.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.usdtPurchase.findMany({
      where: { dayKey, counterparty: PurchaseCounterparty.PROVIDER_MX },
    }),
    prisma.usdtPurchase.findMany({
      where: { counterparty: PurchaseCounterparty.PROVIDER_MX },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { provider: true },
    }),
    loadProviderMxBalanceRowsFromDb(),
  ]);

  const balById = new Map(balancesFromPurchases.map((b) => [b.id, b]));

  let mxn = 0;
  let usdt = 0;
  let expected = 0;
  for (const p of purchasesToday) {
    mxn += Number((p.amountMxn ?? 0).toString());
    usdt += Number(p.usdtAmount.toString());
    const rx = p.rateXe ? Number(p.rateXe.toString()) : 0;
    if (rx > 0 && p.amountMxn) expected += Number(p.amountMxn.toString()) / rx;
  }
  const diff = expected > 0 ? usdt - expected : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-lg font-semibold">Proveedor México</h1>
      <p className="mt-1 text-sm text-zinc-600">Cuadre MXN vs USDT (compras registradas).</p>

      <section className="mt-4 rounded border border-zinc-200 bg-white p-4 text-sm">
        <h2 className="font-medium">Hoy ({dayKey})</h2>
        <p className="mt-2 tabular-nums">
          MXN {formatMoneyDisplay(mxn, FiatCurrency.MXN)} · USDT {formatMoneyDisplay(usdt, "USDT")}
        </p>
        {diff != null ? (
          <p className={`mt-1 font-medium ${Math.abs(diff) < 1 ? "text-emerald-800" : "text-amber-800"}`}>
            Δ vs XE: {formatMoneyDisplay(diff, "USDT")} {Math.abs(diff) < 1 ? "— cuadrado" : "— revisar"}
          </p>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">Sin tasa XE en compras de hoy.</p>
        )}
      </section>

      {canRunOperations(user) ? <ProveedorAltaForm /> : null}

      <section className="mt-8">
        <h2 className="text-sm font-medium">Proveedores — acumulado compras USDT (UsdtPurchase)</h2>
        <ul className="mt-2 text-sm">
          {providers.map((p) => {
            const b = balById.get(p.id);
            return (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-100 py-2">
                <Link href={`/proveedores/${p.id}`} className="text-blue-700 underline">
                  {p.name}
                </Link>
                {b ? (
                  <span className="text-right text-xs tabular-nums text-zinc-700">
                    MXN {formatMoneyDisplay(Number(b.sumMxn.toString()), FiatCurrency.MXN)} ·{" "}
                    {formatMoneyDisplay(Number(b.sumGtq.toString()), FiatCurrency.GTQ)} ·{" "}
                    {formatMoneyDisplay(Number(b.sumUsdt.toString()), "USDT")}
                  </span>
                ) : (
                  <span className="text-xs text-zinc-400">—</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Últimas compras a proveedor</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {purchasesAll.map((p) => (
            <li key={p.id} className="flex justify-between gap-2 border-b border-zinc-100 py-1">
              <span>
                {p.createdAt.toLocaleDateString()} · {p.provider?.name}
              </span>
              <span className="tabular-nums text-zinc-700">
                {formatMoneyDisplay(p.gtqTotal, FiatCurrency.GTQ)} / {formatMoneyDisplay(p.usdtAmount, "USDT")}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
