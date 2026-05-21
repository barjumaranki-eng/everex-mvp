import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canDeleteOtcOperation, canEditOtcOperation, isAdmin } from "@/lib/authz";
import { DeleteOtcOperationForm } from "./DeleteOtcOperationForm";
import { AddOtcAllocationsForm } from "./AddOtcAllocationsForm";
import { formatMoneyDisplay } from "@/lib/format-money";
import { formatRateDisplay } from "@/lib/format-rate";
import { EverexCreditorType, FiatCurrency, MxnLiquidationType, OtcSide } from "@prisma/client";
import {
  CLIENT_OTC_ADVANCE_REASON_SUBSTR,
  clientAdvancePayableNotesMarker,
} from "@/lib/everex-payable-client-advance";
import { getClientBalance } from "@/lib/client-balance";

export default async function OperacionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const [op, operators, bankAccounts, clientBalance] = await Promise.all([
    prisma.otcOperation.findUnique({
      where: { id },
      include: {
        client: true,
        allocations: { include: { operator: true, bankAccount: true } },
        createdBy: true,
      },
    }),
    prisma.operator.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.bankAccount.findMany({ where: { active: true }, orderBy: { label: "asc" } }),
    prisma.otcOperation
      .findUnique({ where: { id }, select: { clientId: true } })
      .then((row) => (row ? getClientBalance(row.clientId) : null)),
  ]);
  if (!op) notFound();

  const advanceForOp =
    op.side === OtcSide.CLIENT_BUYS_USDT &&
    Number(op.totalFiat.toString()) - Number(op.pnlBasisGtq.toString()) > 0.01
      ? await prisma.everexPayable.findFirst({
          where: {
            active: true,
            creditorType: EverexCreditorType.CLIENT,
            notes: { contains: clientAdvancePayableNotesMarker(op.clientId) },
            AND: [
              { reason: { contains: CLIENT_OTC_ADVANCE_REASON_SUBSTR } },
              { reason: { contains: op.ref.slice(0, 8) } },
            ],
          },
          select: { id: true, balance: true, reason: true },
        })
      : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/operaciones" className="text-sm text-blue-700 underline">
        ← Operaciones
      </Link>
      <h1 className="mt-4 text-lg font-semibold">Operación {op.ref}</h1>
      <p className="text-sm text-zinc-600">
        {op.createdAt.toLocaleString()} · {op.createdBy.displayName ?? op.createdBy.email}
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {canEditOtcOperation(user) ? (
          <Link
            href={`/operaciones/${op.id}/edit`}
            className="inline-flex rounded-md border border-blue-600 bg-blue-600 px-3 py-1.5 font-medium text-white shadow-sm hover:bg-blue-700"
          >
            Editar
          </Link>
        ) : null}
        {canDeleteOtcOperation(user) ? (
          <Link
            href="#eliminar-otc"
            className="inline-flex rounded-md border border-red-400 bg-red-50 px-3 py-1.5 font-medium text-red-900 shadow-sm hover:bg-red-100"
          >
            Eliminar
          </Link>
        ) : null}
      </div>

      <dl className="mt-4 space-y-2 rounded border border-zinc-200 bg-white p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-600">Cliente</dt>
          <dd className="font-medium">{op.client.name}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-600">Tipo</dt>
          <dd>{op.side}</dd>
        </div>
        {op.mxnLiquidation ? (
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-600">Liquidación MXN</dt>
            <dd>{op.mxnLiquidation === MxnLiquidationType.GTQ ? "GTQ al cliente" : "USDT al cliente"}</dd>
          </div>
        ) : null}
        {op.usdtPipelineReceived != null ? (
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-600">USDT pipe (MXN ÷ tasa)</dt>
            <dd className="tabular-nums">{formatMoneyDisplay(op.usdtPipelineReceived, "USDT")}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-600">{op.mxnLiquidation === MxnLiquidationType.GTQ ? "USDT al cliente" : "USDT"}</dt>
          <dd className="tabular-nums">{formatMoneyDisplay(op.usdtAmount, "USDT")}</dd>
        </div>
        {op.gtqPaidToClient != null ? (
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-600">GTQ pagados al cliente</dt>
            <dd className="tabular-nums">{formatMoneyDisplay(op.gtqPaidToClient, FiatCurrency.GTQ)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-600">Tasa</dt>
          <dd className="tabular-nums">{formatRateDisplay(op.rateFiatPerUsdt)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-600">Total fiat pactado</dt>
          <dd className="tabular-nums">{formatMoneyDisplay(op.totalFiat, op.fiatCurrency)}</dd>
        </div>
        {op.fiatRecibidoReal != null ? (
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-600">
              {op.side === OtcSide.CLIENT_BUYS_USDT ? "GTQ recibido real" : "GTQ pagado real"}
            </dt>
            <dd className="tabular-nums">{formatMoneyDisplay(op.fiatRecibidoReal, op.fiatCurrency)}</dd>
          </div>
        ) : null}
        {op.usdtEntregadoReal != null ? (
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-600">
              {op.side === OtcSide.CLIENT_BUYS_USDT ? "USDT entregado real" : "USDT recibido real"}
            </dt>
            <dd className="tabular-nums">{formatMoneyDisplay(op.usdtEntregadoReal, "USDT")}</dd>
          </div>
        ) : null}
        {clientBalance &&
        (Number(clientBalance.saldoGTQ.toString()) !== 0 || Number(clientBalance.saldoUSDT.toString()) !== 0) ? (
          <div className="rounded border border-sky-200 bg-sky-50/80 p-3 text-xs text-sky-950 sm:col-span-2">
            <p className="font-medium">Estado de cuenta del cliente (acumulado)</p>
            <p className="mt-1 tabular-nums">
              GTQ: {formatMoneyDisplay(clientBalance.saldoGTQ, FiatCurrency.GTQ)}{" "}
              <span className="text-sky-800/90">
                ({Number(clientBalance.saldoGTQ.toString()) > 0 ? "nos debe" : Number(clientBalance.saldoGTQ.toString()) < 0 ? "le debemos" : "—"})
              </span>
            </p>
            <p className="mt-1 tabular-nums">
              USDT: {formatMoneyDisplay(clientBalance.saldoUSDT, "USDT")}{" "}
              <span className="text-sky-800/90">
                ({Number(clientBalance.saldoUSDT.toString()) > 0 ? "nos debe" : Number(clientBalance.saldoUSDT.toString()) < 0 ? "le debemos" : "—"})
              </span>
            </p>
            <p className="mt-2">
              <Link href={`/clientes/${op.clientId}`} className="underline">
                Ver ficha cliente
              </Link>
            </p>
          </div>
        ) : null}
        {op.side === OtcSide.CLIENT_BUYS_USDT ? (
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-600">GTQ aplicado a venta hoy</dt>
            <dd className="tabular-nums">{formatMoneyDisplay(op.pnlBasisGtq, FiatCurrency.GTQ)}</dd>
          </div>
        ) : null}
        {op.side === OtcSide.CLIENT_BUYS_USDT &&
        Number(op.totalFiat.toString()) - Number(op.pnlBasisGtq.toString()) > 0.01 ? (
          <div className="rounded border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950 sm:col-span-2">
            <p className="font-medium">Anticipo / USDT pendiente por entregar</p>
            <p className="mt-1 tabular-nums">
              GTQ pendiente:{" "}
              {formatMoneyDisplay(
                op.totalFiat.sub(op.pnlBasisGtq),
                FiatCurrency.GTQ,
              )}{" "}
              (no cuenta como utilidad; pasivo en{" "}
              {advanceForOp ? (
                <Link href={`/deudas/${advanceForOp.id}`} className="underline">
                  deuda Everex
                </Link>
              ) : (
                "deudas"
              )}
              ).
            </p>
          </div>
        ) : null}
        {isAdmin(user) ? (
          <>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-600">Base utilidad GTQ</dt>
              <dd className="tabular-nums">{formatMoneyDisplay(op.pnlBasisGtq, FiatCurrency.GTQ)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-600">Utilidad GTQ</dt>
              <dd className="tabular-nums font-medium text-emerald-900">
                {formatMoneyDisplay(op.profitGtq, FiatCurrency.GTQ)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-600">Utilidad USDT</dt>
              <dd className="tabular-nums font-medium text-emerald-900">
                {formatMoneyDisplay(op.profitUsdt, "USDT")}
              </dd>
            </div>
          </>
        ) : null}
        {op.notes ? (
          <div>
            <dt className="text-zinc-600">Notas</dt>
            <dd className="mt-1">{op.notes}</dd>
          </div>
        ) : null}
      </dl>

      <h2 className="mt-6 text-sm font-medium">Reparto</h2>
      {op.allocations.length === 0 ? (
        <p className="text-sm text-zinc-500">Sin repartos registrados.</p>
      ) : (
        <ul className="mt-2 space-y-2 text-sm">
          {op.allocations.map((a) => (
            <li key={a.id} className="rounded border border-zinc-100 bg-white p-2">
              <span className="font-medium">{a.destination}</span>
              {a.operator ? ` → ${a.operator.name}` : ""}
              {a.bankAccount ? ` → ${a.bankAccount.label}` : ""}
              <span className="float-right tabular-nums">
                {a.destination === "OPERATOR" && a.currency === "USDT"
                  ? formatMoneyDisplay(a.amount, "USDT")
                  : formatMoneyDisplay(a.amount, a.currency)}
              </span>
              {a.currency === "USDT" && a.destination === "OPERATOR" ? (
                <div className="text-xs text-zinc-500">Pago operador en USDT</div>
              ) : null}
              {a.reference ? <div className="text-xs text-zinc-500">Ref: {a.reference}</div> : null}
              {a.notes ? <div className="text-xs text-zinc-500">Notas: {a.notes}</div> : null}
            </li>
          ))}
        </ul>
      )}

      {canEditOtcOperation(user) &&
      op.side === OtcSide.CLIENT_BUYS_USDT &&
      op.fiatCurrency === "GTQ" &&
      op.allocations.length === 0 ? (
        <AddOtcAllocationsForm
          operationId={op.id}
          totalFiatBackend={op.totalFiat.toString()}
          totalFiatLabel={formatMoneyDisplay(op.totalFiat, op.fiatCurrency)}
          pnlBasisGtqLabel={formatMoneyDisplay(op.pnlBasisGtq, FiatCurrency.GTQ)}
          rateFiatPerUsdtBackend={op.rateFiatPerUsdt.toString()}
          operators={operators.map((o) => ({ id: o.id, name: o.name }))}
          bankAccounts={bankAccounts.map((b) => ({ id: b.id, name: b.label }))}
        />
      ) : null}

      {canDeleteOtcOperation(user) ? <DeleteOtcOperationForm operationId={op.id} /> : null}
    </main>
  );
}
