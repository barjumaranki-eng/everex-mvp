/**
 * Verificación rápida post-migración (usuarios, operaciones, saldos vía conteos).
 * Uso: node scripts/verify-postgres.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadDotEnv();

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

try {
  const [
    users,
    operators,
    otcOps,
    purchases,
    bankMov,
    expenses,
    alyson,
    fernanda,
  ] = await Promise.all([
    prisma.user.findMany({ select: { email: true, role: true, active: true }, orderBy: { email: "asc" } }),
    prisma.operator.count(),
    prisma.otcOperation.count(),
    prisma.usdtPurchase.count(),
    prisma.bankMovement.count(),
    prisma.expense.count(),
    prisma.user.findUnique({ where: { email: "alyson@everex.local" } }),
    prisma.user.findUnique({ where: { email: "fernanda@everex.local" } }),
  ]);

  console.log("=== verify-postgres ===\n");
  console.log("Usuarios:", users.length);
  for (const u of users) console.log(`  - ${u.email} (${u.role})`);
  console.log("\nOperadores:", operators);
  console.log("Operaciones OTC:", otcOps);
  console.log("Compras USDT:", purchases);
  console.log("Movimientos banco:", bankMov);
  console.log("Gastos:", expenses);
  console.log("\nalyson@everex.local:", alyson ? "OK" : "FALTA");
  console.log("fernanda@everex.local:", fernanda ? "OK" : "FALTA");

  const withProof = await prisma.expense.count({
    where: { NOT: [{ proofImage: null }, { proofImage: "" }] },
  });
  console.log("Gastos con comprobante (texto):", withProof);
} catch (e) {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
