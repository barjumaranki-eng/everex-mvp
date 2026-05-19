import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";
import { SESSION_ROLE_COOKIE, SESSION_USER_COOKIE } from "@/lib/session-cookies";

export { SESSION_ROLE_COOKIE, SESSION_USER_COOKIE, parseSessionRoleCookie } from "@/lib/session-cookies";

export async function getSessionUser(): Promise<User | null> {
  try {
    const id = (await cookies()).get(SESSION_USER_COOKIE)?.value;
    if (!id) return null;
    const user = await prisma.user.findFirst({ where: { id, active: true } });
    return user;
  } catch (e) {
    console.error("[session] getSessionUser:", e);
    return null;
  }
}

const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 días

export async function setSessionUser(user: Pick<User, "id" | "role">) {
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  const base = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
    secure,
  };
  jar.set(SESSION_USER_COOKIE, user.id, base);
  jar.set(SESSION_ROLE_COOKIE, user.role, base);
}

/** @deprecated Preferir setSessionUser; mantiene compatibilidad y rellena rol desde BD. */
export async function setSessionUserId(userId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, active: true } });
  if (!user) return;
  await setSessionUser({ id: user.id, role: user.role });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(SESSION_USER_COOKIE);
  jar.delete(SESSION_ROLE_COOKIE);
}
