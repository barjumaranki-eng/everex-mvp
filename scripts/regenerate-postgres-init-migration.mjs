/**
 * Regenera prisma/migrations/20260518190000_postgres_init/migration.sql
 * en UTF-8 SIN BOM (PowerShell Set-Content -Encoding UTF8 suele añadir BOM y rompe Postgres).
 *
 * Uso: node scripts/regenerate-postgres-init-migration.mjs
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "prisma/migrations/20260518190000_postgres_init/migration.sql");

let sql = execSync("npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script", {
  cwd: root,
  encoding: "utf8",
  stdio: ["pipe", "pipe", "pipe"],
});

sql = sql.replace(/^\uFEFF/, "").trimStart();
writeFileSync(out, sql.endsWith("\n") ? sql : `${sql}\n`, "utf8");

const buf = readFileSync(out);
if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
  console.error("ERROR: el archivo sigue teniendo BOM");
  process.exit(1);
}
console.log("OK:", out, `(${buf.length} bytes, sin BOM)`);
