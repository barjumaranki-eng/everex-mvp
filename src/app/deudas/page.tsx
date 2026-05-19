import Link from "next/link";
import { redirect } from "next/navigation";
import { FiatCurrency } from "@prisma/client";
import { isClientOtcAdvancePayable } from "@/lib/everex-payable-client-advance";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canManageReceivablesAndPayables, canViewReceivablesAndPayables } from "@/lib/authz";
import { formatMoneyDisplay } from "@/lib/format-money";
import {
  hasPayableEntityLink,
  resolvePayableDisplayLabel,
  resolvePayableListSubtitle,
} from "@/lib/payable-creditor";
import { todayDayKey } from "@/lib/day-key";
import { AltaPayableForm } from "./AltaPayableForm";

export default async function DeudasPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canViewReceivablesAndPayables(user)) redirect("/dashboard");

  const dayKey = todayDayKey();
  const [rows, paysToday, clients, operators, providers, pendingSum] = await Promise.all([
    prisma.everexPayable.findMany({
      where: { active: true },
      orderBy: { openedAt: "desc" },
      include: { client: true, operator: true, provider: true },
    }),
    prisma.everexPayablePayment.findMany({
      where: { dayKey },
      select: { amount: true, currency: true },
    }),
    prisma.client.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.operator.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.mexicoProvider.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.everexPayable.findMany({
      where: { active: true },
      select: { balance: true, currency: true },
    }),
  ]);

  const paysTodayGtq = paysToday
    .filter((p) => p.currency === FiatCurrency.GTQ)
    .reduce((s, p) => s + Number(p.amount.toString()), 0);
  const pendingGtq = pendingSum
    .filter((p) => p.currency === FiatCurrency.GTQ)
    .reduce((s, p) => s + Number(p.balance.toString()), 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-lg font-semibold">Deudas Everex</h1>
      <p className="mt-1 text-sm text-zinc-600">Lo que Everex debe. Los pagos salen de banco/caja y restan en utilidad neta.</p>

      <section className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="font-medium">Pagos deuda hoy (GTQ)</h2>
          <p className="mt-1 tabular-nums text-lg">{formatMoneyDisplay(paysTodayGtq, FiatCurrency.GTQ)}</p>
        </div>
        <div className="rounded border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="font-medium">Saldo pendiente (GTQ, aprox.)</h2>
          <p className="mt-1 tabular-nums text-lg">{formatMoneyDisplay(pendingGtq, FiatCurrency.GTQ)}</p>
        </div>
      </section>

      {canManageReceivablesAndPayables(user) ? (
        <AltaPayableForm clients={clients} operators={operators} providers={providers} />
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-medium">Activas</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {rows.map((r) => {
            const label = resolvePayableDisplayLabel(r);
            const linked = hasPayableEntityLink(r);
            return (
              <li key={r.id} className="flex justify-between gap-4 rounded border border-zinc-100 bg-white p-3">
                <div>
                  <Link href={`/deudas/${r.id}`} className="font-medium text-blue-700 underline">
                    {label}
                  </Link>
                  <div className="text-xs text-zinc-600">
                    {isClientOtcAdvancePayable(r) ? (
                      <span className="mr-1 rounded bg-amber-100 px-1 font-medium text-amber-900">Anticipo cliente</span>
                    ) : null}
                    {resolvePayableListSubtitle(r)}
                  </div>
                  <div className="text-xs text-zinc-500">{r.reason}</div>
                  {r.notes ? <div className="text-xs text-zinc-400">{r.notes}</div> : null}
                  {!linked ? (
                    <p className="mt-1 text-xs font-medium text-amber-800">Registro antiguo sin relación</p>
                  ) : null}
                </div>
                <div className="text-right tabular-nums">
                  <div className="font-medium">{formatMoneyDisplay(r.balance, r.currency)}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
