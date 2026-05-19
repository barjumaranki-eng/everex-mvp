"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard/error]", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-lg font-semibold text-zinc-900">Dashboard</h1>
      <div className="mt-4 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-950">
        <p className="font-medium">Algo salió mal al mostrar el tablero.</p>
        <p className="mt-2 break-words text-red-900/90">{error.message || "Error desconocido"}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded border border-red-300 bg-white px-3 py-2 text-red-900"
          >
            Reintentar
          </button>
          <Link href="/bancos" className="rounded bg-zinc-900 px-3 py-2 text-white">
            Ir a bancos
          </Link>
          <Link href="/operaciones" className="text-red-900 underline">
            Operaciones
          </Link>
        </div>
      </div>
    </main>
  );
}
