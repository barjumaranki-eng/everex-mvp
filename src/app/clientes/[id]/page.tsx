import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EverexCreditorType, FiatCurrency } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  CLIENT_OTC_ADVANCE_REASON_SUBSTR,
  clientAdvancePayableNotesMarker,
} from "@/lib/everex-payable-client-advance";
import { getSessionUser } from "@/lib/session";
import { formatMoneyDisplay } from "@/lib/format-money";

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const [c, advancePayables] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      include: {
        balance: true,
        operations: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    }),
    prisma.everexPayable.findMany({
      where: {
        active: true,
        creditorType: EverexCreditorType.CLIENT,
        reason: { contains: CLIENT_OTC_ADVANCE_REASON_SUBSTR },
        OR: [{ clientId: id }, { notes: { contains: clientAdvancePayableNotesMarker(id) } }],
      },
      orderBy: { openedAt: "desc" },
    }),
  ]);
  if (!c) notFound();

  const advancePayablesList = advancePayables ?? [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/clientes" className="text-sm text-blue-700 underline">
        ← Clientes
      </Link>
      <h1 className="mt-4 text-lg font-semibold">{c.name}</h1>
      {c.phone ? <p className="text-sm text-zinc-600">{c.phone}</p> : null}
      {c.notes ? <p className="mt-2 text-sm">{c.notes}</p> : null}

      <section className="mt-6 rounded border border-sky-200 bg-sky-50/60 p-4 text-sm">
        <h2 className="font-medium text-sky-950">Estado de cuenta (saldos arrastrados)</h2>
        <p className="mt-1 text-xs text-sky-900/85">
          Positivo = el cliente nos debe; negativo = le debemos. Se actualiza al guardar operaciones con descuadre
          pactado vs ejecutado.
        </p>
        {c.balance ? (
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-sky-800">Saldo GTQ</dt>
              <dd className="text-lg font-semibold tabular-nums text-sky-950">
                {formatMoneyDisplay(c.balance.saldoGTQ, FiatCurrency.GTQ)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-sky-800">Saldo USDT</dt>
              <dd className="text-lg font-semibold tabular-nums text-sky-950">
                {formatMoneyDisplay(c.balance.saldoUSDT, "USDT")}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-xs text-sky-900/80">Sin saldo acumulado (operaciones cuadradas o sin ejecutado distinto).</p>
        )}
      </section>

      <h2 className="mt-6 text-sm font-medium">Anticipos / USDT por entregar (pasivo Everex)</h2>
      {advancePayablesList.length === 0 ? (
        <p className="mt-1 text-sm text-zinc-500">Sin saldos pendientes de este tipo.</p>
      ) : (
        <ul className="mt-2 space-y-2 text-sm">
          {advancePayablesList.map((p) => (
            <li key={p.id} className="flex justify-between gap-4 rounded border border-amber-100 bg-amber-50/50 px-3 py-2">
              <div>
                <Link href={`/deudas/${p.id}`} className="font-medium text-blue-700 underline">
                  {p.reason}
                </Link>
                <div className="text-xs text-zinc-600">{p.openedAt.toLocaleString()}</div>
              </div>
              <span className="tabular-nums font-medium">{formatMoneyDisplay(p.balance, p.currency)}</span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-6 text-sm font-medium">Operaciones recientes</h2>
      <ul className="mt-2 text-sm">
        {c.operations.map((o) => (
          <li key={o.id} className="border-b border-zinc-100 py-1">
            <Link href={`/operaciones/${o.id}`} className="text-blue-700 underline">
              {o.ref.slice(0, 8)} · {o.side}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
