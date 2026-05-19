"use client";

import { useActionState } from "react";
import { runBackfillOtcAllocationLedger } from "./backfill-ledger-actions";

export function BackfillOtcLedgerForm() {
  const [state, action, pending] = useActionState(runBackfillOtcAllocationLedger, null);

  return (
    <form action={action} className="mt-3 rounded border border-zinc-200 bg-zinc-50 p-3 text-sm">
      <p className="font-medium text-zinc-800">Sincronizar repartos OTC → libro</p>
      <p className="mt-1 text-xs text-zinc-600">
        Crea o enlaza movimientos de operadores (PAGO_CLIENTE, GTQ negativo) y bancos (crédito) por cada línea de
        distribución. Idempotente: no duplica si ya está vinculado por reparto.
      </p>
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded bg-zinc-900 px-3 py-2 text-white text-xs disabled:opacity-60"
      >
        {pending ? "Procesando…" : "Ejecutar sincronización"}
      </button>
      {state?.message ? (
        <p
          className={`mt-2 text-xs ${state.ok === false ? "text-red-800" : "text-emerald-900"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
