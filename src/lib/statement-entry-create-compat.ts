import { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Crea StatementEntry sin `createdAt` manual (compat. con DB antigua).
 * 1) Con `postedAt` si se pasa fecha.
 * 2) Si falla, reintento solo con `base` (defaults del schema).
 */
export async function createStatementEntryCompat(
  tx: Tx,
  base: Omit<Prisma.StatementEntryUncheckedCreateInput, "postedAt" | "createdAt">,
  postedAt?: Date,
): Promise<boolean> {
  if (postedAt) {
    try {
      await tx.statementEntry.create({ data: { ...base, postedAt } });
      return true;
    } catch (e) {
      console.error("[statement-entry-compat] create con postedAt falló:", e);
    }
  }
  try {
    await tx.statementEntry.create({ data: base });
    return true;
  } catch (e) {
    console.error("[statement-entry-compat] create mínimo falló:", e);
    return false;
  }
}
