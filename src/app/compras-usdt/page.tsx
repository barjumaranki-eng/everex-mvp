import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canCreateUsdtPurchase, canDeleteUsdtPurchase, canEditUsdtPurchase, isAdmin } from "@/lib/authz";
import { formatMoneyDisplay } from "@/lib/format-money";
import { formatRateDisplay } from "@/lib/format-rate";
import { FiatCurrency } from "@prisma/client";
import { computeInventoryFromDb } from "@/lib/inventory";
import { CompraForm } from "./CompraForm";

export const dynamic = "force-dynamic";

export default async function ComprasUsdtPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [rows, operators, clients, providers, inv] = await Promise.all([
    prisma.usdtPurchase.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { operator: true, client: true, provider: true, createdBy: true },
    }),
    prisma.operator.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.mexicoProvider.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    isAdmin(user) ? computeInventoryFromDb() : Promise.resolve(null),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-lg font-semibold">Compras USDT</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Solo compras de inventario con costo en GTQ (operador o proveedor MX). Operaciones MXN de cliente →{" "}
        <Link href="/operaciones/nueva" className="text-blue-700 underline">
          Nueva operación · Cliente MXN Spread
        </Link>
        .
      </p>
      {isAdmin(user) && inv ? (
        <p className="mt-2 rounded border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums text-zinc-800">
          Inventario actual: {formatMoneyDisplay(inv.usdt, "USDT")}
          <span className="text-zinc-600"> · Costo prom. {formatRateDisplay(inv.avgGtqPerUsdt)} GTQ/USDT</span>
        </p>
      ) : null}

      {canCreateUsdtPurchase(user) ? (
        <CompraForm
          operators={operators.map((o) => ({ id: o.id, name: o.name }))}
          providers={providers.map((p) => ({ id: p.id, name: p.name }))}
        />
      ) : (
        <p className="mt-4 text-sm text-zinc-500">Solo lectura.</p>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium">Últimas compras</h2>
        <div className="mt-2 overflow-x-auto rounded border border-zinc-200 bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-600">
                <th className="p-2">Fecha</th>
                <th className="p-2">Tipo</th>
                <th className="p-2">Proveedor MX</th>
                <th className="p-2">Operador</th>
                <th className="p-2">GTQ</th>
                <th className="p-2">USDT</th>
                <th className="p-2">Usuario</th>
                <th className="p-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                return (
                  <tr key={r.id} className="border-b border-zinc-100">
                    <td className="p-2 whitespace-nowrap">{r.createdAt.toLocaleString()}</td>
                    <td className="p-2">{r.counterparty}</td>
                    <td className="p-2">{r.provider?.name ?? "—"}</td>
                    <td className="p-2">{r.operator?.name ?? "—"}</td>
                    <td className="p-2 tabular-nums">{formatMoneyDisplay(r.gtqTotal, FiatCurrency.GTQ)}</td>
                    <td className="p-2 tabular-nums">{formatMoneyDisplay(r.usdtAmount, "USDT")}</td>
                    <td className="p-2 text-xs">{r.createdBy.displayName ?? r.createdBy.email}</td>
                    <td className="p-2 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link
                          href={`/compras-usdt/${r.id}`}
                          className="inline-flex rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
                        >
                          Ver
                        </Link>
                        {canEditUsdtPurchase(user) ? (
                          <Link
                            href={`/compras-usdt/${r.id}/edit`}
                            className="inline-flex rounded-md border border-blue-600 bg-blue-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
                          >
                            Editar
                          </Link>
                        ) : null}
                        {canDeleteUsdtPurchase(user) ? (
                          <Link
                            href={`/compras-usdt/${r.id}#eliminar-compra`}
                            className="inline-flex rounded-md border border-red-400 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-900 shadow-sm hover:bg-red-100"
                          >
                            Eliminar
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
