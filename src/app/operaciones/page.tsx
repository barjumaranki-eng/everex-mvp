import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canDeleteOtcOperation, canEditOtcOperation, canRunOperations, canViewSensitiveProfitMetrics } from "@/lib/authz";
import { formatMoneyDisplay } from "@/lib/format-money";
import { formatRateDisplay } from "@/lib/format-rate";
import { FiatCurrency, OtcSide, Prisma } from "@prisma/client";
import { syncOperatorMxnUsdtSettlementsToOperatorLedgerAction } from "@/app/operaciones/operator-mxn-usdt-actions";

function mesaBuyGtqStatus(r: {
  side: OtcSide;
  fiatCurrency: FiatCurrency;
  allocCount: number;
  totalFiat: Prisma.Decimal;
  pnlBasisGtq: Prisma.Decimal;
}): string {
  if (r.side !== OtcSide.CLIENT_BUYS_USDT || r.fiatCurrency !== FiatCurrency.GTQ) return "—";
  if (r.allocCount === 0) return "pendiente";
  const pend = Number(r.totalFiat.sub(r.pnlBasisGtq).toString());
  if (pend > 0.01) return "parcial";
  return "completo";
}

type MesaRow = {
  k: "mesa";
  id: string;
  ref: string;
  createdAt: Date;
  clientName: string;
  side: string;
  sideEnum: OtcSide;
  usdtAmount: Prisma.Decimal;
  rateFiatPerUsdt: Prisma.Decimal;
  totalFiat: Prisma.Decimal;
  fiatCurrency: FiatCurrency;
  pnlBasisGtq: Prisma.Decimal;
  allocCount: number;
  profitGtq: Prisma.Decimal | null;
  profitUsdt: Prisma.Decimal | null;
  status: string;
};

type SpreadRow = {
  k: "spread";
  id: string;
  ref: string;
  createdAt: Date;
  clientName: string;
  providerName: string;
  mxnReceived: Prisma.Decimal;
  clientRate: Prisma.Decimal;
  usdtToClient: Prisma.Decimal;
  profitUsdt: Prisma.Decimal;
};

type OpMxnUsdtRow = {
  k: "op_mxn_usdt";
  id: string;
  ref: string;
  createdAt: Date;
  operatorName: string;
  mxnReceived: Prisma.Decimal;
  xeReference: Prisma.Decimal;
  usdtPaid: Prisma.Decimal;
  diffUsdt: Prisma.Decimal;
};

type UnifiedRow = MesaRow | SpreadRow | OpMxnUsdtRow;

export const dynamic = "force-dynamic";

export default async function OperacionesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const showProfitCols = canViewSensitiveProfitMetrics(user);
  const canOps = canRunOperations(user);
  const canEditOp = canEditOtcOperation(user);
  const canDeleteOp = canDeleteOtcOperation(user);
  const canShowActions = canEditOp || canDeleteOp;
  const sp = searchParams ? await searchParams : {};
  const omSyncCreated = typeof sp.omSyncCreated === "string" ? sp.omSyncCreated : undefined;
  const omSyncSkipped = typeof sp.omSyncSkipped === "string" ? sp.omSyncSkipped : undefined;
  const omSyncExamined = typeof sp.omSyncExamined === "string" ? sp.omSyncExamined : undefined;
  const omSyncErr = typeof sp.omSyncErr === "string" ? sp.omSyncErr : undefined;
  const omSyncNoAuth = sp.omSyncNoAuth === "1";

  const [mesa, spreads] = await Promise.all([
    prisma.otcOperation.findMany({
      orderBy: { createdAt: "desc" },
      take: 80,
      select: {
        id: true,
        ref: true,
        createdAt: true,
        side: true,
        usdtAmount: true,
        rateFiatPerUsdt: true,
        totalFiat: true,
        fiatCurrency: true,
        profitGtq: true,
        profitUsdt: true,
        pnlBasisGtq: true,
        _count: { select: { allocations: true } },
        client: { select: { name: true } },
      },
    }),
    prisma.otcMxnSpread.findMany({
      orderBy: { createdAt: "desc" },
      take: 80,
      include: { client: true, provider: true },
    }),
  ]);

  const opMxnUsdt = await prisma.operatorMxnUsdtSettlement.findMany({
    orderBy: { createdAt: "desc" },
    take: 80,
    include: { operator: true },
  });

  const mesaUnified: MesaRow[] = mesa.map((r) => {
    const allocCount = r._count.allocations;
    return {
      k: "mesa",
      id: r.id,
      ref: r.ref,
      createdAt: r.createdAt,
      clientName: r.client.name,
      side: r.side,
      sideEnum: r.side,
      usdtAmount: r.usdtAmount,
      rateFiatPerUsdt: r.rateFiatPerUsdt,
      totalFiat: r.totalFiat,
      fiatCurrency: r.fiatCurrency,
      pnlBasisGtq: r.pnlBasisGtq,
      allocCount,
      profitGtq: r.profitGtq,
      profitUsdt: r.profitUsdt,
      status: mesaBuyGtqStatus({
        side: r.side,
        fiatCurrency: r.fiatCurrency,
        allocCount,
        totalFiat: r.totalFiat,
        pnlBasisGtq: r.pnlBasisGtq,
      }),
    };
  });

  const spreadUnified: SpreadRow[] = spreads.map((s) => ({
    k: "spread",
    id: s.id,
    ref: s.ref,
    createdAt: s.createdAt,
    clientName: s.client.name,
    providerName: s.provider.name,
    mxnReceived: s.mxnReceived,
    clientRate: s.clientRate,
    usdtToClient: s.usdtToClient,
    profitUsdt: s.profitUsdt,
  }));

  const opMxnUnified: OpMxnUsdtRow[] = opMxnUsdt.map((x) => ({
    k: "op_mxn_usdt",
    id: x.id,
    ref: x.ref,
    createdAt: x.createdAt,
    operatorName: x.operator.name,
    mxnReceived: x.mxnReceived,
    xeReference: x.xeReference,
    usdtPaid: x.usdtPaid,
    diffUsdt: x.diffUsdt,
  }));

  const rows: UnifiedRow[] = [...mesaUnified, ...spreadUnified, ...opMxnUnified]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 80);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Operaciones</h1>
        <Link href="/operaciones/nueva" className="text-sm text-blue-700 underline">
          + Nueva
        </Link>
      </div>
      {omSyncNoAuth ? (
        <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          No autorizado para sincronizar asientos MXN→USDT.
        </p>
      ) : null}
      {omSyncCreated != null || omSyncSkipped != null || omSyncExamined != null || omSyncErr ? (
        <div className="mt-3 rounded border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-950">
          <p className="font-medium">Sincronización libro operador (MXN→USDT)</p>
          <p className="mt-1">
            Revisadas: {omSyncExamined ?? "—"} · Creadas: {omSyncCreated ?? "—"} · Omitidas (ya existían):{" "}
            {omSyncSkipped ?? "—"}
          </p>
          {omSyncErr ? <p className="mt-1 text-red-900">{omSyncErr}</p> : null}
        </div>
      ) : null}
      <div className="mt-4 overflow-x-auto rounded border border-zinc-200 bg-white">
        <table className="min-w-[1100px] w-full text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-[11px] text-zinc-600 sm:text-xs">
              <th className="p-2">Ref</th>
              <th className="p-2">Fecha</th>
              <th className="p-2">Contraparte</th>
              <th className="p-2">Tipo</th>
              <th className="p-2 text-right">MXN</th>
              <th className="p-2 text-right">GTQ recibido</th>
              <th className="p-2 text-right">GTQ aplicado</th>
              <th className="p-2 text-right">GTQ pendiente</th>
              <th className="p-2 text-right">USDT</th>
              <th className="p-2 text-right">Tasa</th>
              {showProfitCols ? (
                <>
                  <th className="p-2 text-right">Util. GTQ</th>
                  <th className="p-2 text-right">Util. USDT</th>
                </>
              ) : null}
              <th className="p-2">Estado</th>
              {canShowActions ? <th className="p-2 text-right">Acciones</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              if (r.k === "mesa") {
                const isBuyGtq =
                  r.sideEnum === OtcSide.CLIENT_BUYS_USDT && r.fiatCurrency === FiatCurrency.GTQ;
                const gtqPend = isBuyGtq ? r.totalFiat.sub(r.pnlBasisGtq) : null;
                const pendNum = gtqPend != null ? Number(gtqPend.toString()) : 0;
                return (
                  <tr key={`m-${r.id}`} className="border-b border-zinc-100">
                    <td className="p-2 font-mono text-[11px] sm:text-xs">
                      <Link href={`/operaciones/${r.id}`} className="text-blue-700 underline">
                        {r.ref.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="p-2 whitespace-nowrap">{r.createdAt.toLocaleString()}</td>
                    <td className="p-2">{r.clientName}</td>
                    <td className="p-2 text-xs">Mesa · {r.side}</td>
                    <td className="p-2 text-right tabular-nums text-zinc-500">—</td>
                    <td className="p-2 text-right tabular-nums">
                      {isBuyGtq ? formatMoneyDisplay(r.totalFiat, FiatCurrency.GTQ) : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {isBuyGtq ? formatMoneyDisplay(r.pnlBasisGtq, FiatCurrency.GTQ) : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums text-amber-900">
                      {isBuyGtq && pendNum > 0.01 ? formatMoneyDisplay(gtqPend!, FiatCurrency.GTQ) : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">{formatMoneyDisplay(r.usdtAmount, "USDT")}</td>
                    <td className="p-2 text-right tabular-nums">{formatRateDisplay(r.rateFiatPerUsdt)}</td>
                    {showProfitCols ? (
                      <>
                        <td className="p-2 text-right tabular-nums text-emerald-900">
                          {formatMoneyDisplay(r.profitGtq, FiatCurrency.GTQ)}
                        </td>
                        <td className="p-2 text-right tabular-nums text-emerald-900">
                          {formatMoneyDisplay(r.profitUsdt, "USDT")}
                        </td>
                      </>
                    ) : null}
                    <td className="p-2 text-xs font-medium capitalize text-zinc-800">{r.status}</td>
                    {canShowActions ? (
                      <td className="p-2 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Link
                            href={`/operaciones/${r.id}`}
                            className="inline-flex rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
                          >
                            Ver
                          </Link>
                          {canEditOp ? (
                            <Link
                              href={`/operaciones/${r.id}/edit`}
                              className="inline-flex rounded-md border border-blue-600 bg-blue-600 px-2 py-1 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
                            >
                              Editar
                            </Link>
                          ) : null}
                          {canDeleteOp ? (
                            <Link
                              href={`/operaciones/${r.id}#eliminar-otc`}
                              className="inline-flex rounded-md border border-red-400 bg-red-50 px-2 py-1 text-xs font-medium text-red-900 shadow-sm hover:bg-red-100"
                            >
                              Eliminar
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              }
              if (r.k === "spread") {
                return (
                  <tr key={`s-${r.id}`} className="border-b border-violet-50 bg-violet-50/40">
                    <td className="p-2 font-mono text-[11px] sm:text-xs">
                      <Link href={`/operaciones/mxn-spread/${r.id}`} className="text-violet-800 underline">
                        {r.ref.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="p-2 whitespace-nowrap">{r.createdAt.toLocaleString()}</td>
                    <td className="p-2">{r.clientName}</td>
                    <td className="p-2 text-xs font-medium text-violet-900">OTC MXN Spread</td>
                    <td className="p-2 text-right tabular-nums">{formatMoneyDisplay(r.mxnReceived, FiatCurrency.MXN)}</td>
                    <td className="p-2 text-right text-zinc-400">—</td>
                    <td className="p-2 text-right text-zinc-400">—</td>
                    <td className="p-2 text-right text-zinc-400">—</td>
                    <td className="p-2 text-right tabular-nums">{formatMoneyDisplay(r.usdtToClient, "USDT")}</td>
                    <td className="p-2 text-right tabular-nums">{formatRateDisplay(r.clientRate)}</td>
                    {showProfitCols ? (
                      <>
                        <td className="p-2 text-right tabular-nums">—</td>
                        <td className="p-2 text-right tabular-nums text-emerald-900">
                          {formatMoneyDisplay(r.profitUsdt, "USDT")}
                        </td>
                      </>
                    ) : null}
                    <td className="p-2 text-xs text-violet-900">completo</td>
                    {canShowActions ? (
                      <td className="p-2 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Link
                            href={`/operaciones/mxn-spread/${r.id}`}
                            className="inline-flex rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
                          >
                            Ver
                          </Link>
                          {canDeleteOp ? (
                            <Link
                              href={`/operaciones/mxn-spread/${r.id}#eliminar-mxn-spread`}
                              className="inline-flex rounded-md border border-red-400 bg-red-50 px-2 py-1 text-xs font-medium text-red-900 shadow-sm hover:bg-red-100"
                            >
                              Eliminar
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              }
              return (
                <tr key={`o-${r.id}`} className="border-b border-emerald-50 bg-emerald-50/40">
                  <td className="p-2 font-mono text-[11px] sm:text-xs">
                    <Link href={`/operaciones/operator-mxn-usdt/${r.id}`} className="text-emerald-900 underline">
                      {r.ref.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="p-2 whitespace-nowrap">{r.createdAt.toLocaleString()}</td>
                  <td className="p-2">{r.operatorName}</td>
                  <td className="p-2 text-xs font-medium text-emerald-950">Operador MXN→USDT</td>
                  <td className="p-2 text-right tabular-nums">{formatMoneyDisplay(r.mxnReceived, FiatCurrency.MXN)}</td>
                  <td className="p-2 text-right text-zinc-400">—</td>
                  <td className="p-2 text-right text-zinc-400">—</td>
                  <td className="p-2 text-right text-zinc-400">—</td>
                  <td className="p-2 text-right tabular-nums">{formatMoneyDisplay(r.usdtPaid, "USDT")}</td>
                  <td className="p-2 text-right tabular-nums">{formatRateDisplay(r.xeReference)}</td>
                  {showProfitCols ? (
                    <>
                      <td className="p-2 text-right tabular-nums">—</td>
                      <td className="p-2 text-right tabular-nums text-emerald-900">
                        {formatMoneyDisplay(r.diffUsdt, "USDT")}
                      </td>
                    </>
                  ) : null}
                  <td className="p-2 text-xs text-emerald-900">—</td>
                  {canShowActions ? (
                    <td className="p-2 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link
                          href={`/operaciones/operator-mxn-usdt/${r.id}`}
                          className="inline-flex rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
                        >
                          Ver
                        </Link>
                        {canDeleteOp ? (
                          <Link
                            href={`/operaciones/operator-mxn-usdt/${r.id}#eliminar-operator-mxn-usdt`}
                            className="inline-flex rounded-md border border-red-400 bg-red-50 px-2 py-1 text-xs font-medium text-red-900 shadow-sm hover:bg-red-100"
                          >
                            Eliminar
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Mesa GTQ: GTQ aplicado = USDT entregado × tasa (base utilidad). GTQ pendiente = anticipo (pasivo cliente). Estados:
        pendiente sin reparto, parcial con anticipo, completo. Violeta: MXN spread. Verde: operador MXN→USDT.
      </p>
      {canOps ? (
        <section className="mt-6 rounded border border-zinc-200 bg-zinc-50 p-4 text-sm">
          <h2 className="font-medium text-zinc-800">Libro operador — liquidaciones MXN→USDT</h2>
          <p className="mt-1 text-xs text-zinc-600">
            Si una liquidación quedó guardada sin asiento en libro operador, ejecute la sincronización (idempotente: no
            duplica ni borra datos).
          </p>
          <form action={syncOperatorMxnUsdtSettlementsToOperatorLedgerAction} className="mt-3">
            <button
              type="submit"
              className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
            >
              Sincronizar asientos MXN→USDT al libro operador
            </button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
