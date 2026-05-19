import { redirect } from "next/navigation";
import { BankMovementType, BankRowStatus, StatementLineStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canImportBankStatements, canManageBanks, canManageExpenses } from "@/lib/authz";
import { formatMoneyDisplay } from "@/lib/format-money";
import { FiatCurrency } from "@prisma/client";
import { getBankBalanceBreakdown } from "@/lib/bank-balance";
import { todayDayKey } from "@/lib/day-key";
import { ImportExtractoForm } from "./ImportExtractoForm";
import {
  addManualStatementLine,
  applySuggestedMatch,
  createExpenseFromStatementLine,
  createIncomeFromStatementLine,
  linkLineToMovement,
  markLineDifference,
  unlinkLine,
} from "./actions";

export default async function ConciliacionBancariaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canImportBankStatements(user) && !canManageBanks(user)) redirect("/dashboard");

  const sp = await searchParams;
  const accRaw = sp.account;
  const accountParam = Array.isArray(accRaw) ? accRaw[0] : accRaw;

  const accounts = await prisma.bankAccount.findMany({
    where: { active: true },
    orderBy: { label: "asc" },
  });
  const bankAccountId = accountParam && accounts.some((a) => a.id === accountParam) ? accountParam : accounts[0]?.id;

  const [lines, movements] = bankAccountId
    ? await Promise.all([
        prisma.bankStatementLine.findMany({
          where: { bankAccountId },
          orderBy: { rowDate: "desc" },
          take: 80,
        }),
        prisma.bankMovement.findMany({
          where: { bankAccountId },
          orderBy: { date: "desc" },
          take: 80,
        }),
      ])
    : [[], []];

  const unmatchedMov = movements.filter(
    (m) => m.status === BankRowStatus.UNMATCHED || m.status === BankRowStatus.POSSIBLE_MATCH,
  );

  const selectedAcc = bankAccountId ? accounts.find((a) => a.id === bankAccountId) : undefined;
  const br = bankAccountId ? await getBankBalanceBreakdown(bankAccountId, todayDayKey()) : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-lg font-semibold">Conciliación bancaria</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Compare extracto vs movimientos del sistema. Importe CSV/XLSX o agregue líneas manuales.
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {accounts.map((a) => (
          <a
            key={a.id}
            href={`/conciliacion-bancaria?account=${a.id}`}
            className={`rounded border px-2 py-1 ${a.id === bankAccountId ? "border-zinc-900 bg-zinc-100" : "border-zinc-200"}`}
          >
            {a.label}
          </a>
        ))}
      </div>

      {br && selectedAcc ? (
        <div className="mt-4 rounded border border-blue-200 bg-blue-50/80 p-3 text-xs text-blue-950">
          <p className="font-medium">Referencia saldo sistema (libro)</p>
          <p className="mt-1 tabular-nums">
            Saldo sistema: {formatMoneyDisplay(br.systemBalance, selectedAcc.currency)}
            {br.openingAmount != null ? (
              <>
                {" "}
                · saldo inicial {formatMoneyDisplay(br.openingAmount, selectedAcc.currency)} al{" "}
                {br.openingEffectiveAt?.toLocaleString() ?? "—"}
              </>
            ) : (
              " · sin saldo inicial (suma neta de movimientos)"
            )}
          </p>
          <p className="mt-1 text-blue-900/80">
            Hoy: +{formatMoneyDisplay(br.creditsToday, selectedAcc.currency)} créditos · −
            {formatMoneyDisplay(br.debitsToday, selectedAcc.currency)} débitos
            {br.reportedBalance != null ? (
              <>
                {" "}
                · real declarado {formatMoneyDisplay(br.reportedBalance, selectedAcc.currency)}
                {br.difference != null ? (
                  <> · Δ {formatMoneyDisplay(br.difference, selectedAcc.currency)}</>
                ) : null}
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      {bankAccountId ? (
        <>
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <div>
              <h2 className="text-sm font-medium">Importar extracto</h2>
              <ImportExtractoForm
                accounts={accounts.map((a) => ({ id: a.id, label: a.label }))}
                defaultAccountId={bankAccountId}
              />
            </div>
            <div>
              <h2 className="text-sm font-medium">Línea manual (extracto)</h2>
              <form action={addManualStatementLine} className="mt-2 space-y-2 rounded border border-zinc-200 bg-white p-4 text-sm">
                <input type="hidden" name="bankAccountId" value={bankAccountId} />
                <label className="block">
                  Fecha
                  <input name="rowDate" type="date" required className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
                </label>
                <label className="block">
                  Descripción
                  <input name="description" required className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
                </label>
                <label className="block">
                  Referencia
                  <input name="reference" className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
                </label>
                <label className="block">
                  Crédito
                  <input name="credit" className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" placeholder="0" />
                </label>
                <label className="block">
                  Débito
                  <input name="debit" className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" placeholder="0" />
                </label>
                <button type="submit" className="rounded bg-zinc-800 px-3 py-2 text-white">
                  Agregar línea
                </button>
              </form>
            </div>
          </section>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <section>
              <h2 className="text-sm font-medium">Líneas extracto</h2>
              <div className="mt-2 max-h-[480px] space-y-2 overflow-y-auto text-xs">
                {lines.map((ln) => (
                  <div key={ln.id} className="rounded border border-zinc-200 bg-white p-2">
                    <div className="flex justify-between gap-2">
                      <span>{ln.rowDate.toLocaleDateString()}</span>
                      <span className="text-[10px] uppercase text-zinc-500">{ln.status}</span>
                    </div>
                    <div className="text-zinc-800">{ln.description}</div>
                    <div className="tabular-nums">
                      {ln.credit ? `+${formatMoneyDisplay(ln.credit, FiatCurrency.GTQ)}` : ""}
                      {ln.debit ? ` −${formatMoneyDisplay(ln.debit, FiatCurrency.GTQ)}` : ""}
                    </div>
                    {ln.status !== StatementLineStatus.MATCHED ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {ln.suggestedMovementId ? (
                          <form action={applySuggestedMatch}>
                            <input type="hidden" name="lineId" value={ln.id} />
                            <input type="hidden" name="movementId" value={ln.suggestedMovementId} />
                            <button type="submit" className="text-blue-700 underline">
                              Usar sugerido
                            </button>
                          </form>
                        ) : null}
                        <form action={markLineDifference}>
                          <input type="hidden" name="lineId" value={ln.id} />
                          <button type="submit" className="text-amber-800 underline">
                            Diferencia
                          </button>
                        </form>
                        {ln.debit && Number(ln.debit.toString()) > 0 && canManageExpenses(user) ? (
                          <form action={createExpenseFromStatementLine}>
                            <input type="hidden" name="lineId" value={ln.id} />
                            <button type="submit" className="text-red-800 underline">
                              Crear gasto
                            </button>
                          </form>
                        ) : null}
                        {ln.credit && Number(ln.credit.toString()) > 0 && canManageBanks(user) ? (
                          <form action={createIncomeFromStatementLine}>
                            <input type="hidden" name="lineId" value={ln.id} />
                            <button type="submit" className="text-emerald-800 underline">
                              Crear ingreso
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ) : (
                      <form action={unlinkLine} className="mt-1">
                        <input type="hidden" name="lineId" value={ln.id} />
                        <button type="submit" className="text-xs text-zinc-500 underline">
                          Desvincular
                        </button>
                      </form>
                    )}
                    {ln.status === StatementLineStatus.UNMATCHED || ln.status === StatementLineStatus.POSSIBLE_MATCH ? (
                      <form action={linkLineToMovement} className="mt-2 flex flex-wrap items-end gap-1">
                        <input type="hidden" name="lineId" value={ln.id} />
                        <label className="text-[10px] text-zinc-600">
                          Mov. sistema
                          <select name="movementId" className="ml-1 max-w-[140px] rounded border px-1 text-[10px]">
                            <option value="">—</option>
                            {unmatchedMov.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.date.toLocaleDateString()} {m.type} {m.amount.toString()}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button type="submit" className="rounded bg-zinc-700 px-2 py-0.5 text-white">
                          Conciliar
                        </button>
                      </form>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-sm font-medium">Movimientos sistema (sin conciliar / posible)</h2>
              <div className="mt-2 max-h-[480px] space-y-1 overflow-y-auto text-xs">
                {unmatchedMov.map((m) => (
                  <div key={m.id} className="flex justify-between gap-2 rounded border border-zinc-100 bg-zinc-50 px-2 py-1">
                    <span>
                      {m.date.toLocaleDateString()} · {m.description.slice(0, 40)}
                    </span>
                    <span className="tabular-nums">
                      {m.type === BankMovementType.CREDIT ? "+" : "−"}
                      {formatMoneyDisplay(m.amount, m.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-zinc-600">Cree una cuenta en Bancos primero.</p>
      )}
    </main>
  );
}
