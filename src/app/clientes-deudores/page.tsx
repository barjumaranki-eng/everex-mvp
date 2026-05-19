import Link from "next/link";
import { redirect } from "next/navigation";
import { FiatCurrency } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canManageReceivablesAndPayables, canViewReceivablesAndPayables } from "@/lib/authz";
import { formatMoneyDisplay } from "@/lib/format-money";
import { todayDayKey } from "@/lib/day-key";
import { AltaReceivableForm } from "./AltaReceivableForm";

export default async function ClientesDeudoresPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canViewReceivablesAndPayables(user)) redirect("/dashboard");

  const dayKey = todayDayKey();
  const [rows, paymentsToday, clients, pendingSum] = await Promise.all([
    prisma.clientReceivable.findMany({
      where: { active: true },
      orderBy: { openedAt: "desc" },
      include: { client: true },
    }),
    prisma.clientReceivablePayment.findMany({
      where: { dayKey },
      select: { amount: true, currency: true },
    }),
    prisma.client.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.clientReceivable.findMany({
      where: { active: true },
      select: { balance: true, currency: true },
    }),
  ]);

  const recvTodayGtq = paymentsToday
    .filter((p) => p.currency === FiatCurrency.GTQ)
    .reduce((s, p) => s + Number(p.amount.toString()), 0);
  const pendingGtq = pendingSum
    .filter((p) => p.currency === FiatCurrency.GTQ)
    .reduce((s, p) => s + Number(p.balance.toString()), 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-lg font-semibold">Clientes deudores</h1>
      <p className="mt-1 text-sm text-zinc-600">Cuentas por cobrar. Los pagos no son utilidad OTC.</p>

      <section className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="font-medium">Pagos hoy (GTQ)</h2>
          <p className="mt-1 tabular-nums text-lg">{formatMoneyDisplay(recvTodayGtq, FiatCurrency.GTQ)}</p>
        </div>
        <div className="rounded border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="font-medium">Saldo pendiente (GTQ, aprox.)</h2>
          <p className="mt-1 tabular-nums text-lg">{formatMoneyDisplay(pendingGtq, FiatCurrency.GTQ)}</p>
        </div>
      </section>

      {canManageReceivablesAndPayables(user) ? (
        <AltaReceivableForm clients={clients.map((c) => ({ id: c.id, name: c.name }))} />
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-medium">Activas</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex justify-between gap-4 rounded border border-zinc-100 bg-white p-3">
              <div>
                <Link href={`/clientes-deudores/${r.id}`} className="font-medium text-blue-700 underline">
                  {r.client.name}
                </Link>
                <div className="text-xs text-zinc-600">{r.reason}</div>
              </div>
              <div className="text-right tabular-nums">
                <div className="font-medium">{formatMoneyDisplay(r.balance, r.currency)}</div>
                <div className="text-xs text-zinc-500">de {formatMoneyDisplay(r.originalAmount, r.currency)}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
