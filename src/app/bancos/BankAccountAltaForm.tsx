"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { FiatCurrency } from "@prisma/client";
import { createBankAccount } from "./actions";
import { ErrorBanner } from "@/app/components/ErrorBanner";

export function BankAccountAltaForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (p: { error?: string } | null, fd: FormData) => {
      const r = await createBankAccount(p, fd);
      if (!r.error) router.refresh();
      return r;
    },
    null,
  );

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-2 rounded border border-zinc-200 bg-white p-4 text-sm">
      <ErrorBanner message={state?.error} />
      <label className="block min-w-[180px]">
        Etiqueta cuenta
        <input name="label" required className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
      </label>
      <label className="block">
        Moneda
        <select name="currency" className="mt-1 rounded border border-zinc-400 px-2 py-1">
          <option value={FiatCurrency.GTQ}>GTQ</option>
          <option value={FiatCurrency.MXN}>MXN</option>
          <option value={FiatCurrency.USD}>USD</option>
        </select>
      </label>
      <button type="submit" disabled={pending} className="rounded bg-zinc-900 px-3 py-2 text-white disabled:opacity-60">
        Agregar cuenta
      </button>
    </form>
  );
}
