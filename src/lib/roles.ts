/** Roles persistidos en cookie + BD (sin importar Prisma en middleware / Edge). */
export const APP_USER_ROLES = ["ADMIN", "TESORERIA", "OPERACIONES", "CONCILIACION", "LECTURA"] as const;
export type AppUserRole = (typeof APP_USER_ROLES)[number];

export function isAppUserRole(raw: string | undefined): raw is AppUserRole {
  return !!raw && (APP_USER_ROLES as readonly string[]).includes(raw);
}
