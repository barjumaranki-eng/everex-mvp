/**
 * Fragmentos de fecha seguros para creates Prisma (`date` / `createdAt` / `postedAt`).
 * La fecha operativa del usuario sigue reflejada en `dayKey` (ver `dayKeyFromDateLocal`).
 */
export function bankMovementOperativeDate(operativeAt: Date): { date: Date } {
  return { date: operativeAt };
}
