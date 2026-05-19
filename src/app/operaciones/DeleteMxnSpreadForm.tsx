"use client";

import { useActionState } from "react";
import { deleteOtcMxnSpread } from "./mxn-spread-actions";

export function DeleteMxnSpreadForm({ spreadId }: { spreadId: string }) {
  const [state, action, pending] = useActionState(deleteOtcMxnSpread, null);

  return (
    <form
      id="eliminar-mxn-spread"
      action={action}
      className="mt-6 scroll-mt-24 rounded border border-red-200 bg-red-50/50 p-4 text-sm"
    >
      <p className="font-medium text-red-900">Zona peligrosa</p>
      <p className="mt-1 text-xs text-red-800/90">
        Elimina el spread MXN cliente y revierte el asiento en libro del proveedor MX. Ajusta inventario USDT (entra lo
        del proveedor, sale lo al cliente). Sin bancos GTQ.
      </p>
      <input type="hidden" name="spreadId" value={spreadId} />
      <label className="mt-3 block text-xs font-medium text-red-950">
        Motivo (obligatorio)
        <textarea
          name="reason"
          rows={2}
          required
          className="mt-1 w-full rounded border border-red-200 bg-white px-2 py-1 text-xs"
          placeholder="Ej. duplicado, error de captura, reversión acordada…"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-900 hover:bg-red-100 disabled:opacity-60"
        onClick={(e) => {
          if (!confirm("¿Eliminar esta operación OTC MXN spread?")) {
            e.preventDefault();
          }
        }}
      >
        {pending ? "Eliminando…" : "Eliminar operación"}
      </button>
      {state?.error ? <p className="mt-2 text-xs text-red-800">{state.error}</p> : null}
    </form>
  );
}
