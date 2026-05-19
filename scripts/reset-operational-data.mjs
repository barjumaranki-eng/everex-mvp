/**
 * RESET OPERATIVO — borra data transaccional; conserva catálogos:
 * User, Client, Operator, MexicoProvider, BankAccount.
 *
 * Orden según prisma/schema.prisma (FK). Tablas no presentes en el cliente se omiten.
 * No usa migrate reset ni db push --force-reset.
 */

import { createScriptPrismaClient } from "./prisma-client.mjs";

const prisma = createScriptPrismaClient();

/** Orden: hijos / tablas que referencian BankMovement y asientos primero. */
const DELETE_ORDER = [
  "bankStatementLine",
  "cuadradoraAdjustment",
  "expense",
  "clientReceivablePayment",
  "everexPayablePayment",
  "bankMovement",
  "bankImportBatch",
  "bankOpeningBalanceAudit",
  "bankOpeningBalance",
  "usdtPurchaseEditLog",
  "usdtPurchase",
  "otcMxnSpread",
  "operatorMxnUsdtSettlement",
  "statementEntry",
  "everexPayable",
  "clientReceivable",
  "otcAllocation",
  "otcOperation",
];

function delegate(name) {
  return prisma[name];
}

async function safeCount(name) {
  const d = delegate(name);
  if (!d || typeof d.count !== "function") return null;
  return d.count();
}

async function safeDeleteMany(name) {
  const d = delegate(name);
  if (!d || typeof d.deleteMany !== "function") return { name, deleted: 0, skipped: true };
  const r = await d.deleteMany({});
  return { name, deleted: r.count, skipped: false };
}

async function main() {
  console.log("DATABASE_URL:", process.env.DATABASE_URL);
  if (!process.env.DATABASE_URL) {
    console.error("Falta DATABASE_URL.");
    process.exit(1);
  }

  const allTables = [...DELETE_ORDER];
  const before = {};
  for (const name of allTables) {
    const n = await safeCount(name);
    if (n !== null) before[name] = n;
  }

  console.log("\n--- Conteos ANTES (solo tablas que existen en el schema) ---");
  for (const [k, v] of Object.entries(before)) {
    console.log(`  ${k}: ${v}`);
  }

  for (const name of DELETE_ORDER) {
    const r = await safeDeleteMany(name);
    if (!r.skipped) console.log(`deleteMany ${r.name}: ${r.deleted}`);
  }

  const after = {};
  for (const name of allTables) {
    const n = await safeCount(name);
    if (n !== null) after[name] = n;
  }

  console.log("\n--- Conteos DESPUÉS ---");
  for (const [k, v] of Object.entries(after)) {
    console.log(`  ${k}: ${v}`);
  }

  const [users, clients, operators, providers, banks] = await Promise.all([
    prisma.user.count(),
    prisma.client.count(),
    prisma.operator.count(),
    prisma.mexicoProvider.count(),
    prisma.bankAccount.count(),
  ]);
  console.log("\n--- Catálogos conservados ---");
  console.log(`  user: ${users}`);
  console.log(`  client: ${clients}`);
  console.log(`  operator: ${operators}`);
  console.log(`  mexicoProvider: ${providers}`);
  console.log(`  bankAccount: ${banks}`);

  console.log("\nRESET OPERATIVO COMPLETADO");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
