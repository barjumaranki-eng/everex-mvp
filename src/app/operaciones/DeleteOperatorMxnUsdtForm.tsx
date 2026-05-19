"use client";

import { useActionState } from "react";
import { deleteOperatorMxnUsdtSettlement } from "./operator-mxn-usdt-actions";

export function DeleteOperatorMxnUsdtForm({ settlementId }: { settlementId: string }) {
  const [state, action, pending] = useActionState(deleteOperatorMxnUsdtSettlement, null);

  return (
    <form
      id="eliminar-operator-mxn-usdt"
      action={action}
      className="mt-6 scroll-mt-24 rounded border border-red-200 bg-red-50/50 p-4 text-sm"
    >
      <p className="font-medium text-red-900">Zona peligrosa</p>
      <p className="mt-1 text-xs text-red-800/90">
        Elimina la liquidación MXN→USDT del operador, borra el asiento de libro vinculado y devuelve el USDT pagado al
        inventario Everex. No modifica bancos GTQ ni saldo GTQ del operador.
      </p>
      <input type="hidden" name="settlementId" value={settlementId} />
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
          if (!confirm("¿Eliminar esta liquidación operador MXN→USDT? Revierte inventario y libro USDT del operador.")) {
            e.preventDefault();
          }
        }}
      >
        {pending ? "Eliminando…" : "Eliminar liquidación"}
      </button>
      {state?.error ? <p className="mt-2 text-xs text-red-800">{state.error}</p> : null}
    </form>
  );
}
