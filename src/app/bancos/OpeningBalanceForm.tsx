"use client";

import { useActionState } from "react";
import { upsertBankOpeningBalance } from "./actions";
import { ErrorBanner } from "@/app/components/ErrorBanner";
import { MoneyInput } from "@/app/components/MoneyInput";
import { FiatCurrency } from "@prisma/client";

type Props = {
  bankAccountId: string;
  accountCurrency: FiatCurrency;
  defaultAmount: string;
  defaultEffectiveAt: string;
  defaultNote: string;
  disabled?: boolean;
  disabledReason?: string;
};

export function OpeningBalanceForm({
  bankAccountId,
  accountCurrency,
  defaultAmount,
  defaultEffectiveAt,
  defaultNote,
  disabled,
  disabledReason,
}: Props) {
  const [state, formAction, pending] = useActionState(upsertBankOpeningBalance, null);

  if (disabled) {
    return <p className="text-sm text-amber-800">{disabledReason ?? "No disponible."}</p>;
  }

  return (
    <form action={formAction} className="mt-2 space-y-2 text-sm">
      <input type="hidden" name="bankAccountId" value={bankAccountId} />
      <ErrorBanner message={state?.error} />
      <label className="block">
        Saldo inicial ({accountCurrency})
        <div className="mt-1">
          <MoneyInput name="amount" currency={accountCurrency} required defaultValue={defaultAmount} />
        </div>
      </label>
      <label className="block">
        Fecha y hora de corte
        <input
          name="effectiveAt"
          type="datetime-local"
          required
          defaultValue={defaultEffectiveAt}
          className="mt-1 w-full rounded border border-zinc-400 px-2 py-1"
        />
      </label>
      <label className="block">
        Nota
        <input name="note" defaultValue={defaultNote} className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
      </label>
      <button type="submit" disabled={pending} className="rounded bg-zinc-900 px-3 py-2 text-white disabled:opacity-60">
        {pending ? "Guardando…" : "Guardar saldo inicial"}
      </button>
    </form>
  );
}
