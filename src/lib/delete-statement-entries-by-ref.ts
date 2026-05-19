import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Borra asientos con refType/refId y limpia `CuadradoraAdjustment` que apunten a esos asientos.
 * @returns cantidad de filas StatementEntry eliminadas.
 */
export async function deleteStatementEntriesByRefInTx(tx: Tx, refType: string, refId: string): Promise<number> {
  const stmts = await tx.statementEntry.findMany({
    where: { refType, refId },
    select: { id: true },
  });
  if (stmts.length === 0) return 0;
  const ids = stmts.map((s) => s.id);
  await tx.cuadradoraAdjustment.deleteMany({ where: { statementEntryId: { in: ids } } });
  const res = await tx.statementEntry.deleteMany({ where: { id: { in: ids } } });
  return res.count;
}
