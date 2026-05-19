"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { deleteOperatorIfSafe, renameOperator, setOperatorActive } from "./actions";
import { ErrorBanner } from "@/app/components/ErrorBanner";

type Props = {
  id: string;
  name: string;
  active: boolean;
  canDelete: boolean;
};

export function OperadorRowManage({ id, name, active, canDelete }: Props) {
  const router = useRouter();
  const [renState, renAction, renPending] = useActionState(renameOperator, null);
  const [delState, delAction, delPending] = useActionState(deleteOperatorIfSafe, null);

  useEffect(() => {
    if (delState && !delState.error) router.refresh();
  }, [delState, router]);

  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-zinc-100 pt-2 text-xs">
      <form action={renAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <label className="flex flex-wrap items-center gap-1">
          <span className="text-zinc-500">Editar nombre</span>
          <input
            name="name"
            defaultValue={name}
            required
            className="min-w-[140px] rounded border border-zinc-400 px-2 py-1"
          />
        </label>
        <button type="submit" disabled={renPending} className="rounded bg-zinc-700 px-2 py-1 text-white">
          {renPending ? "…" : "Guardar"}
        </button>
      </form>
      <ErrorBanner message={renState?.error} />

      {active ? (
        <form
          action={setOperatorActive}
          onSubmit={(e) => {
            if (
              !confirm(
                "¿Desactivar este operador? Dejará de aparecer en formularios nuevos. El historial y saldos se conservan.",
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="active" value="false" />
          <button type="submit" className="text-amber-800 underline">
            Desactivar / archivar
          </button>
        </form>
      ) : (
        <form
          action={setOperatorActive}
          onSubmit={(e) => {
            if (!confirm("¿Reactivar este operador? Volverá a aparecer en listas y formularios.")) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="active" value="true" />
          <button type="submit" className="text-emerald-800 underline">
            Reactivar
          </button>
        </form>
      )}

      {canDelete ? (
        <>
          <form
            action={delAction}
            onSubmit={(e) => {
              if (
                !confirm(
                  `¿Eliminar definitivamente a “${name}”? No hay movimientos ni saldo en libro. Esta acción no se puede deshacer.`,
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="id" value={id} />
            <button type="submit" disabled={delPending} className="text-red-700 underline disabled:opacity-50">
              {delPending ? "…" : "Eliminar del sistema"}
            </button>
          </form>
          <ErrorBanner message={delState?.error} />
        </>
      ) : (
        <p className="text-zinc-500">
          Eliminar no disponible: hay asientos, compras, repartos o deudas vinculadas, o saldo distinto de cero. Use
          desactivar para quitarlo de formularios nuevos.
        </p>
      )}
    </div>
  );
}
