"use client";

import { useActionState } from "react";
import { updateBankReportedBalance } from "./actions";
import { ErrorBanner } from "@/app/components/ErrorBanner";
import { MoneyInput } from "@/app/components/MoneyInput";
import type { FiatCurrency } from "@prisma/client";

export function ReportedBalanceForm({
  bankAccountId,
  currency,
  defaultValue,
}: {
  bankAccountId: string;
  currency: FiatCurrency;
  defaultValue: string;
}) {
  const [state, formAction, pending] = useActionState(updateBankReportedBalance, null);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 text-xs">
      <input type="hidden" name="bankAccountId" value={bankAccountId} />
      <ErrorBanner message={state?.error} />
      <label className="block min-w-[140px]">
        Saldo banco real
        <div className="mt-0.5">
          <MoneyInput name="reportedBalance" currency={currency} defaultValue={defaultValue} />
        </div>
      </label>
      <button type="submit" disabled={pending} className="rounded bg-zinc-700 px-2 py-1 text-white disabled:opacity-60">
        {pending ? "…" : "Guardar"}
      </button>
      <p className="w-full text-[10px] text-zinc-500">Opcional. Vacío borra el valor. Para comparar con saldo sistema.</p>
    </form>
  );
}
