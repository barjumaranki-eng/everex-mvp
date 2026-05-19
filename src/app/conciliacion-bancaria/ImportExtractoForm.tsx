"use client";

import { useActionState, useEffect, useState } from "react";
import { importBankStatement } from "./actions";
import { ErrorBanner } from "@/app/components/ErrorBanner";

type Acc = { id: string; label: string };

export function ImportExtractoForm({ accounts, defaultAccountId }: { accounts: Acc[]; defaultAccountId?: string }) {
  const [state, formAction, pending] = useActionState(importBankStatement, null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (state && "imported" in state && state.imported != null) {
      setMsg(`Importadas ${state.imported} filas.`);
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-2 rounded border border-zinc-200 bg-white p-4 text-sm">
      <ErrorBanner message={state && "error" in state ? state.error : undefined} />
      {msg ? <p className="text-emerald-800">{msg}</p> : null}
      <label className="block">
        Cuenta banco
        <select
          name="bankAccountId"
          required
          defaultValue={defaultAccountId ?? accounts[0]?.id}
          className="mt-1 w-full rounded border border-zinc-400 px-2 py-1"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Etiqueta lote
        <input name="label" className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" placeholder="Extracto 2026-05-01" />
      </label>
      <label className="block">
        CSV o XLSX
        <input name="file" type="file" accept=".csv,.txt,.xlsx" required className="mt-1 w-full text-xs" />
      </label>
      <p className="text-xs text-zinc-500">
        Columnas esperadas: fecha, descripción, referencia (opcional), crédito y/o débito, saldo (opcional).
      </p>
      <button type="submit" disabled={pending} className="rounded bg-zinc-900 px-3 py-2 text-white disabled:opacity-60">
        {pending ? "Importando…" : "Importar"}
      </button>
    </form>
  );
}
