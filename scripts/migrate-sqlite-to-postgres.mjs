/**
 * Copia todos los datos de SQLite (prisma/dev.db) → PostgreSQL (DATABASE_URL / DIRECT_URL en .env).
 *
 * Requisitos:
 *   1. Schema Prisma ya en provider postgresql
 *   2. `npx prisma migrate deploy` ejecutado contra Supabase (tablas vacías)
 *   3. .env con DATABASE_URL (pooler) y DIRECT_URL (directa)
 *
 * Uso: npm run db:migrate:sqlite-to-pg
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
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
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function resolveSqlitePath() {
  const raw =
    process.env.SQLITE_DATABASE_URL?.trim() ||
    process.env.SQLITE_URL?.trim() ||
    "file:./prisma/dev.db";
  if (!raw.startsWith("file:")) {
    throw new Error("SQLITE_DATABASE_URL debe ser file:...");
  }
  let filePath = raw.slice("file:".length).replace(/^\/+/, "");
  const abs = isAbsolute(filePath) ? filePath : resolve(root, filePath.replace(/^\.\//, ""));
  if (!existsSync(abs)) {
    throw new Error(`SQLite no encontrado: ${abs}`);
  }
  return abs;
}

/** Campos DateTime en prisma/schema.prisma (+ alias habituales). */
const DATE_TIME_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "reportedBalanceAt",
  "effectiveAt",
  "postedAt",
  "date",
  "openedAt",
  "paymentDate",
  "rowDate",
  "deletedAt",
  "paidAt",
  "completedAt",
  "approvedAt",
  "operatedAt",
]);

/** Campos Boolean en schema (SQLite suele guardarlos como 0/1). */
const BOOLEAN_FIELDS = new Set(["active"]);

/**
 * SQLite guarda fechas como epoch ms (número) o ISO string.
 * PostgreSQL/Prisma requiere Date.
 */
function toDate(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : v;
  }
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    if (/^\d{10,14}$/.test(t)) {
      const n = Number(t);
      const d = t.length <= 10 ? new Date(n * 1000) : new Date(n);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(Number(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toBoolean(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (t === "true" || t === "1") return true;
    if (t === "false" || t === "0") return false;
  }
  return Boolean(v);
}

function isDateTimeField(key, value) {
  if (DATE_TIME_FIELDS.has(key)) return true;
  if (key.endsWith("At") && key !== "amount") return true;
  if (key === "date" || key === "rowDate") return true;
  if (typeof value === "number" && value > 1e10 && value < 1e15) return true;
  if (typeof value === "string" && /^\d{10,14}$/.test(value.trim())) return true;
  return false;
}

/** Orden topológico (padres antes que hijos). */
const TABLE_ORDER = [
  "User",
  "Operator",
  "Client",
  "MexicoProvider",
  "BankAccount",
  "BankOpeningBalance",
  "BankOpeningBalanceAudit",
  "UsdtPurchase",
  "UsdtPurchaseEditLog",
  "OtcOperation",
  "OtcMxnSpread",
  "OperatorMxnUsdtSettlement",
  "OtcAllocation",
  "StatementEntry",
  "BankMovement",
  "BankImportBatch",
  "BankStatementLine",
  "Expense",
  "ClientReceivable",
  "ClientReceivablePayment",
  "EverexPayable",
  "EverexPayablePayment",
  "CuadradoraAdjustment",
  "AppAuditLog",
];

function coerceRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) {
      out[k] = v;
      continue;
    }
    if (typeof v === "string" && (k === "payloadBefore" || k === "payloadAfter")) {
      try {
        out[k] = JSON.parse(v);
      } catch {
        out[k] = v;
      }
      continue;
    }
    if (isDateTimeField(k, v)) {
      out[k] = toDate(v);
      continue;
    }
    if (BOOLEAN_FIELDS.has(k)) {
      out[k] = toBoolean(v);
      continue;
    }
    out[k] = v;
  }
  return out;
}

function modelFromTable(table) {
  return table.charAt(0).toLowerCase() + table.slice(1);
}

loadDotEnv();

const sqlitePath = resolveSqlitePath();
const db = new Database(sqlitePath, { readonly: true });

const pg = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

console.log("[migrate] SQLite:", sqlitePath);
console.log("[migrate] Postgres:", (process.env.DIRECT_URL || process.env.DATABASE_URL || "").replace(/:[^:@/]+@/, ":***@"));

try {
  const counts = {};
  for (const table of TABLE_ORDER) {
    const rows = db.prepare(`SELECT * FROM "${table}"`).all();
    counts[table] = rows.length;
    if (rows.length === 0) continue;

    const model = modelFromTable(table);
    const delegate = pg[model];
    if (!delegate?.createMany) {
      throw new Error(`Modelo Prisma no encontrado para tabla ${table} (${model})`);
    }

    const data = rows.map(coerceRow);
    const batchSize = 200;
    for (let i = 0; i < data.length; i += batchSize) {
      const chunk = data.slice(i, i + batchSize);
      await delegate.createMany({ data: chunk, skipDuplicates: true });
    }
    console.log(`[migrate] ${table}: ${rows.length} filas`);
  }

  console.log("\n[migrate] Resumen:", counts);

  const users = await pg.user.count();
  const ops = await pg.otcOperation.count();
  const purchases = await pg.usdtPurchase.count();
  console.log("[verify] User:", users, "| OtcOperation:", ops, "| UsdtPurchase:", purchases);
} catch (e) {
  console.error("[migrate] ERROR:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  db.close();
  await pg.$disconnect();
}
