import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import {
  canCreateBankOpeningBalance,
  canEditBankOpeningBalance,
  canManageBanks,
} from "@/lib/authz";
import { toDatetimeLocalInputValue } from "@/lib/bank-balance";
import { formatMoneyDisplay } from "@/lib/format-money";
import { OpeningBalanceForm } from "../OpeningBalanceForm";

export default async function SaldosInicialesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canManageBanks(user)) redirect("/dashboard");

  const accounts = await prisma.bankAccount.findMany({
    where: { active: true },
    orderBy: { label: "asc" },
    include: {
      openingBalance: {
        include: {
          audits: { orderBy: { createdAt: "desc" }, take: 8, include: { user: true } },
        },
      },
    },
  });

  const canCreate = canCreateBankOpeningBalance(user);
  const canEdit = canEditBankOpeningBalance(user);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/bancos" className="text-sm text-blue-700 underline">
          ← Bancos
        </Link>
      </div>
      <h1 className="mt-4 text-lg font-semibold">Saldos iniciales</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Punto de partida para saldo sistema = saldo inicial + movimientos desde la fecha de corte. La primera carga puede
        hacerla tesorería; corregir un saldo ya guardado es solo administración.
      </p>

      <ul className="mt-8 space-y-8">
        {accounts.map((a) => {
          const ob = a.openingBalance;
          const hasOpening = !!ob;
          const formDisabled = hasOpening && !canEdit;
          const defaultAmt = ob ? ob.amount.toString() : "";
          const defaultDt = ob ? toDatetimeLocalInputValue(ob.effectiveAt) : "";
          const defaultNote = ob?.note ?? "";

          return (
            <li key={a.id} className="rounded border border-zinc-200 bg-white p-4">
              <h2 className="font-medium text-zinc-900">
                {a.label} · {a.currency}
              </h2>
              {ob ? (
                <p className="mt-1 text-sm text-zinc-600">
                  Registrado: {formatMoneyDisplay(ob.amount, a.currency)} al {ob.effectiveAt.toLocaleString()}
                  {ob.updatedByUserId ? " (actualizado)" : ""}
                </p>
              ) : (
                <p className="mt-1 text-sm text-zinc-500">Sin saldo inicial.</p>
              )}

              {!hasOpening && !canCreate ? (
                <p className="mt-2 text-sm text-amber-800">No tiene permiso para dar de alta el saldo inicial.</p>
              ) : (
                <OpeningBalanceForm
                  bankAccountId={a.id}
                  accountCurrency={a.currency}
                  defaultAmount={defaultAmt}
                  defaultEffectiveAt={defaultDt}
                  defaultNote={defaultNote}
                  disabled={formDisabled}
                  disabledReason="Este banco ya tiene saldo inicial. Solo administración puede corregirlo."
                />
              )}

              {ob && ob.audits.length > 0 ? (
                <details className="mt-4 text-xs text-zinc-600">
                  <summary className="cursor-pointer text-zinc-700">Auditoría reciente</summary>
                  <ul className="mt-2 space-y-1 border-t border-zinc-100 pt-2">
                    {ob.audits.map((log) => (
                      <li key={log.id}>
                        {log.createdAt.toLocaleString()} · {log.user.email}: {log.field}{" "}
                        <span className="text-red-800">{log.oldValue ?? "∅"}</span> →{" "}
                        <span className="text-emerald-800">{log.newValue ?? "∅"}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
