"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loginAction } from "@/app/login/login.actions";
import type { LoginFormState } from "@/app/login/login-types";
import { ErrorBanner } from "@/app/components/ErrorBanner";

const initialState: LoginFormState = null;

function resolveUrlError(urlError?: string | null): string | null {
  if (!urlError) return null;
  if (urlError === "role") {
    return "Sesión o rol inválido. Vuelva a iniciar sesión (si el problema continúa, avise a administración).";
  }
  return urlError;
}

export function LoginForm({ urlError }: { urlError?: string | null }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const message = resolveUrlError(urlError) || state?.error;

  useEffect(() => {
    if (state?.redirectTo) {
      router.replace(state.redirectTo);
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="mt-4 space-y-2 text-sm">
      <ErrorBanner message={message} />
      <label className="block">
        Email
        <input name="email" type="email" required autoComplete="username" className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
      </label>
      <label className="block">
        Contraseña
        <input name="password" type="password" required autoComplete="current-password" className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
      </label>
      <button type="submit" disabled={pending} className="rounded bg-zinc-900 px-3 py-2 text-white disabled:opacity-60">
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
