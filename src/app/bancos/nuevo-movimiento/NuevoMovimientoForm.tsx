"use client";

import { useActionState } from "react";
import { BankMovementType, FiatCurrency } from "@prisma/client";
import { createBankMovement } from "../actions";
import { ErrorBanner } from "@/app/components/ErrorBanner";
import { OperativeDateTimeFields } from "@/app/components/OperativeDateTimeFields";
import { MoneyInput } from "@/app/components/MoneyInput";

type Acc = { id: string; label: string; currency: FiatCurrency };

export function NuevoMovimientoForm({ accounts }: { accounts: Acc[] }) {
  const [state, formAction, pending] = useActionState(createBankMovement, null);

  return (
    <form action={formAction} className="mt-4 space-y-3 rounded border border-zinc-200 bg-white p-4 text-sm">
      <ErrorBanner message={state?.error} />
      <OperativeDateTimeFields />
      <label className="block">
        Cuenta
        <select name="bankAccountId" required className="mt-1 w-full rounded border border-zinc-400 px-2 py-1">
          <option value="">—</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label} ({a.currency})
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Tipo
        <select name="type" required className="mt-1 w-full rounded border border-zinc-400 px-2 py-1">
          <option value={BankMovementType.CREDIT}>Entrada (crédito)</option>
          <option value={BankMovementType.DEBIT}>Salida (débito)</option>
        </select>
      </label>
      <label className="block">
        Moneda
        <select name="currency" required className="mt-1 w-full rounded border border-zinc-400 px-2 py-1">
          <option value={FiatCurrency.GTQ}>GTQ</option>
          <option value={FiatCurrency.MXN}>MXN</option>
          <option value={FiatCurrency.USD}>USD</option>
        </select>
      </label>
      <label className="block">
        Monto
        <div className="mt-1">
          <MoneyInput name="amount" currency="PLAIN" required />
        </div>
      </label>
      <label className="block">
        Descripción
        <input name="description" className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
      </label>
      <label className="block">
        Referencia
        <input name="reference" className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
      </label>
      <button type="submit" disabled={pending} className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-60">
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
