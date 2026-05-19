"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createOperator } from "./actions";
import { ErrorBanner } from "@/app/components/ErrorBanner";

export function OperadorAltaForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (p: { error?: string } | null, fd: FormData) => {
      const r = await createOperator(p, fd);
      if (!r.error) router.refresh();
      return r;
    },
    null,
  );

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-2 rounded border border-zinc-200 bg-white p-4 text-sm">
      <ErrorBanner message={state?.error} />
      <label className="block min-w-[200px]">
        Nombre operador
        <input name="name" required className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
      </label>
      <button type="submit" disabled={pending} className="rounded bg-zinc-900 px-3 py-2 text-white disabled:opacity-60">
        {pending ? "…" : "Agregar"}
      </button>
    </form>
  );
}
