import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canDeleteOtcOperation, canViewSensitiveProfitMetrics } from "@/lib/authz";
import { formatMoneyDisplay } from "@/lib/format-money";
import { formatRateDisplay } from "@/lib/format-rate";
import { FiatCurrency } from "@prisma/client";
import { DeleteOperatorMxnUsdtForm } from "../../DeleteOperatorMxnUsdtForm";

export const dynamic = "force-dynamic";

export default async function OperatorMxnUsdtDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const row = await prisma.operatorMxnUsdtSettlement.findUnique({
    where: { id },
    include: { operator: true, provider: true, createdBy: true },
  });
  if (!row) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/operaciones" className="text-sm text-blue-700 underline">
        ← Operaciones
      </Link>
      <h1 className="mt-4 text-lg font-semibold">Operador MXN → USDT {row.ref.slice(0, 8)}</h1>
      <p className="text-sm text-zinc-600">
        {row.createdAt.toLocaleString()} · {row.createdBy.displayName ?? row.createdBy.email}
      </p>
      {canDeleteOtcOperation(user) ? (
        <div className="mt-3">
          <Link
            href="#eliminar-operator-mxn-usdt"
            className="inline-flex rounded-md border border-red-400 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-900 shadow-sm hover:bg-red-100"
          >
            Eliminar liquidación
          </Link>
        </div>
      ) : null}

      <dl className="mt-4 space-y-2 rounded border border-emerald-200 bg-emerald-50/50 p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-600">Operador</dt>
          <dd className="font-medium">{row.operator.name}</dd>
        </div>
        {row.provider ? (
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-600">Proveedor MX</dt>
            <dd className="font-medium">{row.provider.name}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-600">MXN recibidos</dt>
          <dd className="tabular-nums">{formatMoneyDisplay(row.mxnReceived, FiatCurrency.MXN)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-600">XE referencia</dt>
          <dd className="tabular-nums">{formatRateDisplay(row.xeReference)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-600">USDT pagados</dt>
          <dd className="tabular-nums">{formatMoneyDisplay(row.usdtPaid, "USDT")}</dd>
        </div>
        {row.gtqRateOptional != null ? (
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-600">Tasa ref. GTQ/USDT</dt>
            <dd className="tabular-nums">{formatRateDisplay(row.gtqRateOptional)}</dd>
          </div>
        ) : null}
        {row.gtqRateOptional != null ? (
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-600">GTQ salida (USDT pagados × tasa)</dt>
            <dd className="tabular-nums font-medium text-zinc-900">
              {formatMoneyDisplay(row.usdtPaid.mul(row.gtqRateOptional), FiatCurrency.GTQ)}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-600">USDT referencia</dt>
          <dd className="tabular-nums">{formatMoneyDisplay(row.referenceUsdt, "USDT")}</dd>
        </div>
        {canViewSensitiveProfitMetrics(user) ? (
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-600">Diferencia USDT</dt>
            <dd className="tabular-nums font-medium text-emerald-900">{formatMoneyDisplay(row.diffUsdt, "USDT")}</dd>
          </div>
        ) : null}
        {row.notes ? (
          <div>
            <dt className="text-zinc-600">Notas</dt>
            <dd className="mt-1">{row.notes}</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-4 text-xs text-zinc-600">
        Sin movimiento bancario GTQ. Los USDT pagados reducen inventario Everex y el saldo USDT del operador. Si la
        liquidación incluye <strong>tasa GTQ/USDT</strong> (<code className="text-zinc-700">gtqRateOptional</code>), también
        rebaja el saldo GTQ del operador en <code className="text-zinc-700">usdtPaid × tasa</code> (histórico desde la
        tabla de liquidaciones, no desde asientos).
      </p>
      {row.gtqRateOptional == null ? (
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          Falta tasa GTQ/USDT para liquidar saldo GTQ: esta fila no ajustó el saldo GTQ del operador. Si debe cuadrar
          contra deuda en quetzales, registre una nueva liquidación con la tasa o corrija en base de datos con cuidado.
        </p>
      ) : null}
      {canDeleteOtcOperation(user) ? <DeleteOperatorMxnUsdtForm settlementId={row.id} /> : null}
    </main>
  );
}
