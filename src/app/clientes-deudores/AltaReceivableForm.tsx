"use client";

import { useActionState } from "react";
import { FiatCurrency } from "@prisma/client";
import { createReceivable } from "./actions";
import { ErrorBanner } from "@/app/components/ErrorBanner";
import { MoneyInput } from "@/app/components/MoneyInput";

type ClientOpt = { id: string; name: string };

export function AltaReceivableForm({ clients }: { clients: ClientOpt[] }) {
  const [state, formAction, pending] = useActionState(createReceivable, null);

  return (
    <form action={formAction} className="mt-4 space-y-2 rounded border border-zinc-200 bg-white p-4 text-sm">
      <ErrorBanner message={state?.error} />
      <label className="block">
        Cliente
        <select name="clientId" required className="mt-1 w-full rounded border border-zinc-400 px-2 py-1">
          <option value="">—</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Monto original
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
        Motivo
        <input name="reason" required className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
      </label>
      <label className="block">
        Notas
        <textarea name="notes" rows={2} className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
      </label>
      <button type="submit" disabled={pending} className="rounded bg-zinc-900 px-3 py-2 text-white disabled:opacity-60">
        Registrar deuda
      </button>
    </form>
  );
}
