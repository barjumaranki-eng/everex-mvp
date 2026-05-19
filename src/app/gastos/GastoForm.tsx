"use client";

import { useActionState } from "react";
import {
  ExpenseCategory,
  FiatCurrency,
  FundsChannel,
} from "@prisma/client";
import { createExpense } from "./actions";
import { ErrorBanner } from "@/app/components/ErrorBanner";
import { OperativeDateTimeFields } from "@/app/components/OperativeDateTimeFields";
import { MoneyInput } from "@/app/components/MoneyInput";

type BankOpt = { id: string; label: string };

export function GastoForm({ banks }: { banks: BankOpt[] }) {
  const [state, formAction, pending] = useActionState(createExpense, null);

  return (
    <form action={formAction} className="mt-4 space-y-3 rounded border border-zinc-200 bg-white p-4 text-sm">
      <ErrorBanner message={state?.error} />
      <OperativeDateTimeFields />
      <label className="block">
        Categoría
        <select name="category" required className="mt-1 w-full rounded border border-zinc-400 px-2 py-1">
          {Object.values(ExpenseCategory).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Monto
        <div className="mt-1">
          <MoneyInput name="amount" currency="PLAIN" required />
        </div>
      </label>
      <label className="block">
        Moneda
        <select name="currency" className="mt-1 w-full rounded border border-zinc-400 px-2 py-1">
          <option value={FiatCurrency.GTQ}>GTQ</option>
          <option value={FiatCurrency.MXN}>MXN</option>
          <option value={FiatCurrency.USD}>USD</option>
        </select>
      </label>
      <label className="block">
        Sale de
        <select name="channel" required className="mt-1 w-full rounded border border-zinc-400 px-2 py-1">
          <option value={FundsChannel.BANK}>Banco Everex</option>
          <option value={FundsChannel.CASH}>Caja</option>
        </select>
      </label>
      <label className="block">
        Cuenta banco (si aplica)
        <select name="bankAccountId" className="mt-1 w-full rounded border border-zinc-400 px-2 py-1">
          <option value="">—</option>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Descripción
        <input name="description" required className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
      </label>
      <label className="block">
        Comprobante (URL o nota, opcional)
        <input name="proofImage" className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
      </label>
      <button type="submit" disabled={pending} className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-60">
        {pending ? "Guardando…" : "Registrar gasto"}
      </button>
    </form>
  );
}
