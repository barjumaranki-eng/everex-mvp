/**
 * Limpia datos operativos y conserva catálogos.
 *
 * Conserva: Client, Operator, MexicoProvider, User, BankAccount.
 * Elimina: OTC, compras USDT, repartos, statement entries, movimientos bancarios,
 * importaciones/conciliación, gastos, cuentas por cobrar/pagar y pagos,
 * saldos iniciales banco + auditoría, spreads MXN.
 *
 * No usa `prisma migrate reset`.
 *
 * Uso (desde la raíz del repo):
 *   node prisma/clear-operational-data.mjs
 *
 * Solo contar sin borrar:
 *   node prisma/clear-operational-data.mjs --dry-run
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function countOperational() {
  return {
    bankStatementLine: await prisma.bankStatementLine.count(),
    bankImportBatch: await prisma.bankImportBatch.count(),
    usdtPurchaseEditLog: await prisma.usdtPurchaseEditLog.count(),
    usdtPurchase: await prisma.usdtPurchase.count(),
    bankOpeningBalanceAudit: await prisma.bankOpeningBalanceAudit.count(),
    bankOpeningBalance: await prisma.bankOpeningBalance.count(),
    statementEntry: await prisma.statementEntry.count(),
    expense: await prisma.expense.count(),
    clientReceivablePayment: await prisma.clientReceivablePayment.count(),
    clientReceivable: await prisma.clientReceivable.count(),
    everexPayablePayment: await prisma.everexPayablePayment.count(),
    everexPayable: await prisma.everexPayable.count(),
    otcMxnSpread: await prisma.otcMxnSpread.count(),
    otcAllocation: await prisma.otcAllocation.count(),
    otcOperation: await prisma.otcOperation.count(),
    bankMovement: await prisma.bankMovement.count(),
  };
}

/** Orden respetando FKs de schema.prisma */
async function clearOperationalInTx(tx) {
  await tx.bankStatementLine.deleteMany();
  await tx.bankImportBatch.deleteMany();

  await tx.usdtPurchaseEditLog.deleteMany();
  await tx.usdtPurchase.deleteMany();

  await tx.bankOpeningBalanceAudit.deleteMany();
  await tx.bankOpeningBalance.deleteMany();

  await tx.statementEntry.deleteMany();

  await tx.expense.deleteMany();

  await tx.clientReceivablePayment.deleteMany();
  await tx.clientReceivable.deleteMany();
  await tx.everexPayablePayment.deleteMany();
  await tx.everexPayable.deleteMany();

  await tx.otcMxnSpread.deleteMany();

  await tx.otcOperation.deleteMany();

  await tx.bankMovement.deleteMany();

  await tx.bankAccount.updateMany({
    data: { reportedBalance: null, reportedBalanceAt: null },
  });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(
    "[clear-operational-data] Preserva: Client, Operator, MexicoProvider, User, BankAccount.",
  );

  if (dryRun) {
    const c = await countOperational();
    console.log("[clear-operational-data] --dry-run conteos:", c);
    return;
  }

  const before = await countOperational();
  console.log("[clear-operational-data] Filas antes:", before);

  await prisma.$transaction(
    async (tx) => {
      await clearOperationalInTx(tx);
    },
    { maxWait: 60_000, timeout: 120_000 },
  );

  const after = await countOperational();
  console.log("[clear-operational-data] Filas operativas restantes (esperado 0):", after);

  console.log("[clear-operational-data] Catálogos:", {
    clients: await prisma.client.count(),
    operators: await prisma.operator.count(),
    mexicoProviders: await prisma.mexicoProvider.count(),
    users: await prisma.user.count(),
    bankAccounts: await prisma.bankAccount.count(),
  });
}

main()
  .catch((e) => {
    console.error("[clear-operational-data] Error:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
