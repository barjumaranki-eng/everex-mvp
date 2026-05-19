"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createMexicoProvider } from "./actions";
import { ErrorBanner } from "@/app/components/ErrorBanner";

export function ProveedorAltaForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (p: { error?: string } | null, fd: FormData) => {
      const r = await createMexicoProvider(p, fd);
      if (!r.error) router.refresh();
      return r;
    },
    null,
  );

  return (
    <form action={formAction} className="mt-4 space-y-2 rounded border border-zinc-200 bg-white p-4 text-sm">
      <ErrorBanner message={state?.error} />
      <label className="block">
        Nombre
        <input name="name" required className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
      </label>
      <label className="block">
        Notas
        <textarea name="notes" rows={2} className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
      </label>
      <button type="submit" disabled={pending} className="rounded bg-zinc-900 px-3 py-2 text-white disabled:opacity-60">
        Agregar proveedor
      </button>
    </form>
  );
}
