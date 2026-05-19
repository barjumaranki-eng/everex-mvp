import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canDeleteOtcOperation, canViewSensitiveProfitMetrics } from "@/lib/authz";
import { formatMoneyDisplay } from "@/lib/format-money";
import { formatRateDisplay } from "@/lib/format-rate";
import { FiatCurrency } from "@prisma/client";
import { DeleteMxnSpreadForm } from "../../DeleteMxnSpreadForm";

export const dynamic = "force-dynamic";

export default async function MxnSpreadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const ledgerWarn = sp.ledgerWarn === "1" || sp.ledgerWarn === "true";

  const op = await prisma.otcMxnSpread.findUnique({
    where: { id },
    include: { client: true, provider: true, createdBy: true },
  });
  if (!op) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/operaciones" className="text-sm text-blue-700 underline">
        ← Operaciones
      </Link>
      <h1 className="mt-4 text-lg font-semibold">OTC MXN Spread {op.ref}</h1>
      <p className="text-sm text-zinc-600">
        {op.createdAt.toLocaleString()} · {op.createdBy.displayName ?? op.createdBy.email}
      </p>
      {canDeleteOtcOperation(user) ? (
        <div className="mt-3">
          <Link
            href="#eliminar-mxn-spread"
            className="inline-flex rounded-md border border-red-400 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-900 shadow-sm hover:bg-red-100"
          >
            Eliminar operación
          </Link>
        </div>
      ) : null}

      {ledgerWarn ? (
        <div className="mt-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="font-medium">Asiento en libro proveedor MX</p>
          <p className="mt-1 text-xs">
            La operación quedó registrada, pero no se pudo crear el asiento auxiliar en libro (compatibilidad de
            columnas). Puede sincronizarlo más adelante desde herramientas de libro o soporte técnico.
          </p>
        </div>
      ) : null}

      <dl className="mt-4 space-y-2 rounded border border-violet-200 bg-violet-50/50 p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-600">Cliente</dt>
          <dd className="font-medium">{op.client.name}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-600">Proveedor MX</dt>
          <dd className="font-medium">{op.provider.name}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-600">MXN recibido</dt>
          <dd className="tabular-nums">{formatMoneyDisplay(op.mxnReceived, FiatCurrency.MXN)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-600">XE proveedor (MXN/USDT)</dt>
          <dd className="tabular-nums">{formatRateDisplay(op.xeProvider)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-600">Tasa cliente (MXN/USDT)</dt>
          <dd className="tabular-nums">{formatRateDisplay(op.clientRate)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-600">USDT recibido proveedor</dt>
          <dd className="tabular-nums">{formatMoneyDisplay(op.usdtFromProvider, "USDT")}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-600">USDT entregado cliente</dt>
          <dd className="tabular-nums">{formatMoneyDisplay(op.usdtToClient, "USDT")}</dd>
        </div>
        {canViewSensitiveProfitMetrics(user) ? (
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-600">Utilidad USDT</dt>
            <dd className="tabular-nums font-medium text-emerald-900">
              {formatMoneyDisplay(op.profitUsdt, "USDT")}
            </dd>
          </div>
        ) : null}
        {op.notes ? (
          <div>
            <dt className="text-zinc-600">Notas</dt>
            <dd className="mt-1">{op.notes}</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-4 text-xs text-zinc-600">
        Inventario USDT: entra lo generado con el proveedor (XE), sale lo entregado al cliente. Sin GTQ ni bancos GTQ.
        Proveedor MX: queda asiento en libro (ref. esta operación).
      </p>
      {canDeleteOtcOperation(user) ? <DeleteMxnSpreadForm spreadId={op.id} /> : null}
    </main>
  );
}
