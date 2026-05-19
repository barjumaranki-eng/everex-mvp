"use client";

import { useActionState } from "react";
import { deleteUsdtPurchase } from "./actions";

export function DeleteUsdtPurchaseForm({ purchaseId }: { purchaseId: string }) {
  const [state, action, pending] = useActionState(deleteUsdtPurchase, null);

  return (
    <form id="eliminar-compra" action={action} className="mt-8 scroll-mt-24 rounded border border-red-200 bg-red-50/50 p-4 text-sm">
      <p className="font-medium text-red-900">Eliminar compra USDT</p>
      <p className="mt-1 text-xs text-red-800/90">
        Quita la compra del inventario y borra el asiento de libro vinculado. Esta acción afecta inventario, bancos y
        saldos.
      </p>
      <input type="hidden" name="id" value={purchaseId} />
      <label className="mt-3 block text-xs font-medium text-red-950">
        Motivo (obligatorio)
        <textarea
          name="reason"
          rows={2}
          required
          className="mt-1 w-full rounded border border-red-200 bg-white px-2 py-1 text-xs"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-900 hover:bg-red-100 disabled:opacity-60"
        onClick={(e) => {
          if (
            !confirm(
              "Esta acción afecta inventario, bancos y saldos. ¿Confirmar eliminación de esta compra USDT?",
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        {pending ? "Eliminando…" : "Eliminar compra"}
      </button>
      {state?.error ? <p className="mt-2 text-xs text-red-800">{state.error}</p> : null}
    </form>
  );
}
