import { redirect } from "next/navigation";
import { FiatCurrency } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canCreateExpenses, canViewExpenses } from "@/lib/authz";
import { formatMoneyDisplay } from "@/lib/format-money";
import { todayDayKey } from "@/lib/day-key";
import { monthBoundsDayKeys } from "@/lib/day-range";
import { GastoForm } from "./GastoForm";

export default async function GastosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canViewExpenses(user)) redirect("/dashboard");

  const dayKey = todayDayKey();
  const { start: monthStart, end: monthEnd } = monthBoundsDayKeys();

  const [todayRows, monthRows, byCat, banks] = await Promise.all([
    prisma.expense.findMany({
      where: { dayKey },
      orderBy: { date: "desc" },
      include: { createdBy: true, bankAccount: true },
    }),
    prisma.expense.findMany({
      where: { dayKey: { gte: monthStart, lte: monthEnd } },
      select: { amount: true, currency: true, category: true },
    }),
    prisma.expense.groupBy({
      by: ["category"],
      where: { dayKey: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
    }),
    prisma.bankAccount.findMany({ where: { active: true }, orderBy: { label: "asc" } }),
  ]);

  const monthTotalGtq = monthRows
    .filter((r) => r.currency === FiatCurrency.GTQ)
    .reduce((s, r) => s + Number(r.amount.toString()), 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-lg font-semibold">Gastos</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Restan a la utilidad neta (no a la utilidad bruta OTC). Con banco Everex genera movimiento débito.
      </p>

      <section className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="font-medium">Hoy</h2>
          <p className="mt-1 tabular-nums text-lg">
            {formatMoneyDisplay(
              todayRows.filter((e) => e.currency === FiatCurrency.GTQ).reduce((s, e) => s + Number(e.amount.toString()), 0),
              FiatCurrency.GTQ,
            )}
          </p>
        </div>
        <div className="rounded border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="font-medium">Mes (solo GTQ en total)</h2>
          <p className="mt-1 tabular-nums text-lg">{formatMoneyDisplay(monthTotalGtq, FiatCurrency.GTQ)}</p>
        </div>
      </section>

      {canCreateExpenses(user) ? <GastoForm banks={banks.map((b) => ({ id: b.id, label: b.label }))} /> : null}

      <section className="mt-8">
        <h2 className="text-sm font-medium">Por categoría (mes, suma bruta registrada)</h2>
        <ul className="mt-2 text-sm">
          {byCat.map((c) => (
            <li key={c.category} className="flex justify-between border-b border-zinc-100 py-1">
              <span>{c.category}</span>
              <span className="tabular-nums">{formatMoneyDisplay(c._sum.amount ?? 0, FiatCurrency.GTQ)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Gastos de hoy</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {todayRows.map((e) => (
            <li key={e.id} className="rounded border border-zinc-100 bg-white p-2">
              <div className="flex justify-between gap-2">
                <span className="font-medium">{e.category}</span>
                <span className="tabular-nums">{formatMoneyDisplay(e.amount, e.currency)}</span>
              </div>
              <div className="text-xs text-zinc-600">{e.description}</div>
              <div className="text-xs text-zinc-400">
                {e.channel} {e.bankAccount ? `· ${e.bankAccount.label}` : ""} · {e.createdBy.displayName ?? e.createdBy.email}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
