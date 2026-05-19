"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { describeDatabaseUrl } from "@/lib/database-url";
import { setSessionUser, clearSession } from "@/lib/session";
import { getRoleHomePath } from "@/lib/rbac";
import { isAppUserRole } from "@/lib/roles";
import type { LoginFormState } from "./login-types";

function safeErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return "No se pudo iniciar sesión";
}

function logLoginError(stage: string, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  const stack = e instanceof Error ? e.stack : undefined;
  console.error(`[login] ${stage}:`, msg, stack ?? e);
}

function isNextRedirectError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const digest = (e as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * Server action para useActionState.
 * Errores → `{ error }`. Éxito → `{ redirectTo }` (navegación en cliente; evita Failed to fetch).
 */
export async function loginAction(_prev: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  console.log("[login] email recibido:", email || "(vacío)");
  const dbInfo = describeDatabaseUrl();
  console.log("[login] DATABASE_URL host:", dbInfo.host, "| database:", dbInfo.database);
  console.log("[login] DATABASE_URL resolved:", dbInfo.resolved);

  if (!email || !password) {
    return { error: "Email y contraseña requeridos" };
  }

  let user: {
    id: string;
    role: string;
    passwordHash: string;
    active: boolean;
  } | null = null;

  try {
    user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true, passwordHash: true, active: true },
    });
  } catch (e) {
    logLoginError("prisma findUnique", e);
    return { error: "No se pudo verificar la cuenta (base de datos). Revise la consola del servidor." };
  }

  console.log("[login] usuario encontrado:", !!user);
  console.log("[login] role:", user?.role ?? "(sin usuario)");

  if (!user) {
    return { error: "Credenciales inválidas" };
  }

  if (!user.active) {
    return { error: "Credenciales inválidas" };
  }

  if (!user.passwordHash) {
    return { error: "Cuenta mal configurada (sin contraseña). Contacte a administración." };
  }

  let compareOk = false;
  try {
    compareOk = await bcrypt.compare(password, user.passwordHash);
  } catch (e) {
    logLoginError("bcrypt.compare", e);
    return { error: "Error al verificar la contraseña." };
  }

  console.log("[login] password ok:", compareOk);
  if (!compareOk) {
    return { error: "Credenciales inválidas" };
  }

  if (!isAppUserRole(user.role)) {
    console.log("[login] role no permitido en app:", user.role);
    return {
      error: `Rol de usuario no reconocido (${user.role}). Contacte a administración.`,
    };
  }

  try {
    await setSessionUser({ id: user.id, role: user.role });
  } catch (e) {
    logLoginError("setSessionUser", e);
    return { error: `No se pudo guardar la sesión: ${safeErrorMessage(e)}` };
  }

  let nextPath: string;
  try {
    nextPath = getRoleHomePath(user.role);
  } catch (e) {
    logLoginError("getRoleHomePath", e);
    nextPath = "/dashboard";
  }

  if (!nextPath.startsWith("/")) {
    nextPath = "/dashboard";
  }

  console.log("[login] redirect path:", nextPath);
  return { redirectTo: nextPath };
}

export async function logoutAction() {
  try {
    await clearSession();
  } catch (e) {
    logLoginError("logout clearSession", e);
  }
  redirect("/login");
}
