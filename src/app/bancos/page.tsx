import Link from "next/link";
import { redirect } from "next/navigation";
import { BankMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canCreateBankMovement, canLiquidateOperatorBankGtq, canManageBanks, canRunOperations } from "@/lib/authz";
import { UserRole } from "@prisma/client";
import { formatMoneyDisplay } from "@/lib/format-money";
import { BankAccountAltaForm } from "./BankAccountAltaForm";
import { submitToggleBankMatch } from "./actions";
import { getBankBalanceBreakdown } from "@/lib/bank-balance";
import { todayDayKey } from "@/lib/day-key";
import { ReportedBalanceForm } from "./ReportedBalanceForm";

export default async function BancosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const canSee =
    user.role === UserRole.LECTURA ||
    canManageBanks(user) ||
    canRunOperations(user) ||
    user.role === UserRole.ADMIN;
  if (!canSee) redirect("/dashboard");

  const dayKey = todayDayKey();

  const [accounts, movements] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { active: true },
      orderBy: { label: "asc" },
    }),
    prisma.bankMovement.findMany({
      orderBy: { date: "desc" },
      take: 60,
      include: { bankAccount: true },
    }),
  ]);

  const breakdowns = await Promise.all(accounts.map((a) => getBankBalanceBreakdown(a.id, dayKey)));

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Bancos</h1>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/bancos/saldos-iniciales" className="text-blue-700 underline">
            Saldos iniciales
          </Link>
          {canCreateBankMovement(user) ? (
            <Link href="/bancos/nuevo-movimiento" className="text-blue-700 underline">
              + Movimiento
            </Link>
          ) : null}
          {canLiquidateOperatorBankGtq(user) ? (
            <Link href="/bancos/pagar-operador" className="text-blue-700 underline">
              Pagar operador
            </Link>
          ) : null}
        </div>
      </div>
      <p className="mt-1 text-sm text-zinc-600">Conciliación simple: marque filas como cuadradas cuando coincidan.</p>

      {canCreateBankMovement(user) ? <BankAccountAltaForm /> : null}

      <section className="mt-6">
        <h2 className="text-sm font-medium">Cuentas y saldos (hoy)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Saldo sistema = saldo inicial (desde corte) + créditos − débitos posteriores al corte. Sin saldo inicial, es la
          suma neta de todos los movimientos.
        </p>
        <ul className="mt-3 space-y-4 text-sm">
          {accounts.map((a, i) => {
            const b = breakdowns[i];
            const reportedStr = b.reportedBalance != null ? String(b.reportedBalance) : "";
            return (
              <li key={a.id} className="rounded border border-zinc-200 bg-white p-3">
                <div className="font-medium text-zinc-900">
                  {a.label} · {a.currency}
                </div>
                <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                  <div className="flex justify-between gap-2 border-b border-zinc-50 py-0.5">
                    <dt className="text-zinc-600">Saldo inicial (corte)</dt>
                    <dd className="tabular-nums">
                      {b.openingAmount != null ? (
                        <>
                          {formatMoneyDisplay(b.openingAmount, a.currency)}{" "}
                          <span className="text-zinc-500">
                            ({b.openingEffectiveAt?.toLocaleString() ?? "—"})
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 border-b border-zinc-50 py-0.5">
                    <dt className="text-zinc-600">Créditos hoy</dt>
                    <dd className="tabular-nums text-emerald-800">+{formatMoneyDisplay(b.creditsToday, a.currency)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 border-b border-zinc-50 py-0.5">
                    <dt className="text-zinc-600">Débitos hoy</dt>
                    <dd className="tabular-nums text-red-800">−{formatMoneyDisplay(b.debitsToday, a.currency)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 border-b border-zinc-50 py-0.5">
                    <dt className="text-zinc-600">Saldo sistema</dt>
                    <dd className="tabular-nums font-medium">{formatMoneyDisplay(b.systemBalance, a.currency)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 border-b border-zinc-50 py-0.5">
                    <dt className="text-zinc-600">Saldo banco real</dt>
                    <dd className="tabular-nums">
                      {b.reportedBalance != null ? formatMoneyDisplay(b.reportedBalance, a.currency) : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 py-0.5">
                    <dt className="text-zinc-600">Diferencia (real − sistema)</dt>
                    <dd className="tabular-nums font-medium">
                      {b.difference != null ? formatMoneyDisplay(b.difference, a.currency) : "—"}
                    </dd>
                  </div>
                </dl>
                {canManageBanks(user) ? (
                  <div className="mt-3 border-t border-zinc-100 pt-2">
                    <ReportedBalanceForm bankAccountId={a.id} currency={a.currency} defaultValue={reportedStr} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Movimientos recientes</h2>
        <div className="mt-2 overflow-x-auto rounded border border-zinc-200 bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-600">
                <th className="p-2">Fecha</th>
                <th className="p-2">Cuenta</th>
                <th className="p-2">Tipo</th>
                <th className="p-2">Monto</th>
                <th className="p-2">Estado</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b border-zinc-100">
                  <td className="p-2 whitespace-nowrap">{m.date.toLocaleDateString()}</td>
                  <td className="p-2">{m.bankAccount.label}</td>
                  <td className="p-2">{m.type}</td>
                  <td className="p-2 tabular-nums">
                    {m.type === BankMovementType.CREDIT ? "+" : "−"}
                    {formatMoneyDisplay(m.amount, m.currency)}
                  </td>
                  <td className="p-2 text-xs">{m.status}</td>
                  <td className="p-2">
                    {canManageBanks(user) ? (
                      <form action={submitToggleBankMatch}>
                        <input type="hidden" name="id" value={m.id} />
                        <button type="submit" className="text-xs text-blue-700 underline">
                          {m.status === "MATCHED" ? "Desmarcar" : "Cuadrado"}
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
