import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FiatCurrency } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canDeleteUsdtPurchase, canEditUsdtPurchase } from "@/lib/authz";
import { DeleteUsdtPurchaseForm } from "../DeleteUsdtPurchaseForm";
import { formatMoneyDisplay } from "@/lib/format-money";
import { formatRateDisplay } from "@/lib/format-rate";
import { UserRole } from "@prisma/client";

export default async function CompraUsdtDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const row = await prisma.usdtPurchase.findUnique({
    where: { id },
    include: {
      operator: true,
      client: true,
      provider: true,
      createdBy: true,
      editLogs: { orderBy: { createdAt: "desc" }, take: 30, include: { user: true } },
    },
  });
  if (!row) notFound();

  const canEdit = canEditUsdtPurchase(user);
  const canDelete = canDeleteUsdtPurchase(user);
  const readonly = user.role === UserRole.LECTURA;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/compras-usdt"
          className="inline-flex rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
        >
          ← Compras USDT
        </Link>
        {canEdit ? (
          <Link
            href={`/compras-usdt/${id}/edit`}
            className="inline-flex rounded-md border border-blue-600 bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            Editar
          </Link>
        ) : null}
        {canDelete ? (
          <Link
            href="#eliminar-compra"
            className="inline-flex rounded-md border border-red-400 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-900 shadow-sm hover:bg-red-100"
          >
            Eliminar
          </Link>
        ) : null}
      </div>

      <h1 className="mt-4 text-lg font-semibold">Compra USDT</h1>
      <p className="mt-1 text-xs text-zinc-500">Registrada {row.createdAt.toLocaleString()} · {row.createdBy.displayName ?? row.createdBy.email}</p>

      <dl className="mt-6 space-y-2 rounded border border-zinc-200 bg-white p-4 text-sm">
        <div className="flex justify-between gap-4 border-b border-zinc-100 py-1">
          <dt className="text-zinc-600">Contraparte</dt>
          <dd>{row.counterparty}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-zinc-100 py-1">
          <dt className="text-zinc-600">Proveedor MX</dt>
          <dd>{row.provider?.name ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-zinc-100 py-1">
          <dt className="text-zinc-600">Operador asociado</dt>
          <dd>{row.operator?.name ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-zinc-100 py-1">
          <dt className="text-zinc-600">Cliente</dt>
          <dd>{row.client?.name ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-zinc-100 py-1">
          <dt className="text-zinc-600">GTQ total</dt>
          <dd className="tabular-nums">{formatMoneyDisplay(row.gtqTotal, FiatCurrency.GTQ)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-zinc-100 py-1">
          <dt className="text-zinc-600">USDT</dt>
          <dd className="tabular-nums">{formatMoneyDisplay(row.usdtAmount, "USDT")}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-zinc-100 py-1">
          <dt className="text-zinc-600">MXN</dt>
          <dd className="tabular-nums">
            {row.amountMxn != null ? formatMoneyDisplay(row.amountMxn, FiatCurrency.MXN) : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-zinc-100 py-1">
          <dt className="text-zinc-600">XE</dt>
          <dd className="tabular-nums">{formatRateDisplay(row.rateXe)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-zinc-100 py-1">
          <dt className="text-zinc-600">MXN→GTQ</dt>
          <dd className="tabular-nums">{formatRateDisplay(row.rateMxnToGtq)}</dd>
        </div>
        <div className="flex justify-between gap-4 py-1">
          <dt className="text-zinc-600">Notas</dt>
          <dd className="text-right">{row.notes ?? "—"}</dd>
        </div>
      </dl>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Historial de cambios</h2>
        {row.editLogs.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Sin ediciones registradas.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-xs text-zinc-700">
            {row.editLogs.map((log) => (
              <li key={log.id} className="rounded border border-zinc-100 bg-zinc-50 px-2 py-1">
                <span className="text-zinc-500">{log.createdAt.toLocaleString()}</span> ·{" "}
                {log.user.displayName ?? log.user.email}: <span className="font-medium">{log.field}</span>{" "}
                <span className="text-red-800">{log.oldValue ?? "∅"}</span> →{" "}
                <span className="text-emerald-800">{log.newValue ?? "∅"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canDelete ? <DeleteUsdtPurchaseForm purchaseId={row.id} /> : null}

      {readonly ? <p className="mt-6 text-sm text-zinc-500">Solo lectura.</p> : null}
    </main>
  );
}
