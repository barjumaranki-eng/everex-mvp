import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canDeleteUsdtPurchase, canEditUsdtPurchase } from "@/lib/authz";
import { CompraEditForm } from "../../CompraEditForm";

export default async function CompraUsdtEditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canEditUsdtPurchase(user)) redirect("/compras-usdt");

  const canDelete = canDeleteUsdtPurchase(user);
  const { id } = await params;
  const row = await prisma.usdtPurchase.findUnique({ where: { id } });
  if (!row) notFound();

  const operatorOr: Prisma.OperatorWhereInput[] = [{ active: true }];
  if (row.operatorId) operatorOr.push({ id: row.operatorId });
  const clientOr: Prisma.ClientWhereInput[] = [{ active: true }];
  if (row.clientId) clientOr.push({ id: row.clientId });
  const providerOr: Prisma.MexicoProviderWhereInput[] = [{ active: true }];
  if (row.providerId) providerOr.push({ id: row.providerId });

  const [operators, clients, providers] = await Promise.all([
    prisma.operator.findMany({ where: { OR: operatorOr }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ where: { OR: clientOr }, orderBy: { name: "asc" } }),
    prisma.mexicoProvider.findMany({ where: { OR: providerOr }, orderBy: { name: "asc" } }),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/compras-usdt"
          className="inline-flex rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
        >
          ← Compras USDT
        </Link>
        <Link
          href={`/compras-usdt/${id}`}
          className="inline-flex rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
        >
          Ver compra
        </Link>
        {canDelete ? (
          <Link
            href={`/compras-usdt/${id}#eliminar-compra`}
            className="inline-flex rounded-md border border-red-400 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-900 shadow-sm hover:bg-red-100"
          >
            Eliminar
          </Link>
        ) : null}
      </div>
      <h1 className="mt-4 text-lg font-semibold">Editar compra USDT</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Los cambios actualizan inventario, estado de cuenta del operador/cliente/proveedor y auditoría.
      </p>

      <CompraEditForm
        purchaseId={row.id}
        defaultOperativeIso={row.createdAt.toISOString()}
        counterparty={row.counterparty}
        operatorId={row.operatorId}
        clientId={row.clientId}
        providerId={row.providerId}
        amountMxn={row.amountMxn?.toString() ?? ""}
        gtqTotal={row.gtqTotal.toString()}
        usdtAmount={row.usdtAmount.toString()}
        rateXe={row.rateXe?.toString() ?? ""}
        rateMxnToGtq={row.rateMxnToGtq?.toString() ?? ""}
        notes={row.notes ?? ""}
        operators={operators.map((o) => ({ id: o.id, name: o.name }))}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        providers={providers.map((p) => ({ id: p.id, name: p.name }))}
      />
    </main>
  );
}
