import type { AppUserRole } from "@/lib/roles";
import { isAppUserRole } from "@/lib/roles";

export const SESSION_USER_COOKIE = "everex_uid";
export const SESSION_ROLE_COOKIE = "everex_role";

export function parseSessionRoleCookie(raw: string | undefined): AppUserRole | null {
  if (!isAppUserRole(raw)) return null;
  return raw;
}
