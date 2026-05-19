/**
 * Sincroniza schema con SQLite (sin migraciones) y ejecuta seed.
 * No usa `prisma migrate reset`.
 */
import "./load-env.mjs";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd) {
  console.log(`\n[db-fresh] $ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: root, env: process.env });
}

console.log("[db-fresh] raíz:", root);
console.log("[db-fresh] DATABASE_URL:", process.env.DATABASE_URL ?? "(defina en entorno o .env cargado por su shell)");

const nextDir = join(root, ".next");
if (existsSync(nextDir)) {
  console.log("[db-fresh] eliminando .next …");
  rmSync(nextDir, { recursive: true, force: true });
}

run("npx prisma generate");
console.log("[db-fresh] prisma generate OK");

run("npx prisma db push --force-reset");
console.log("[db-fresh] base sincronizada (db push --force-reset)");

run("npx tsx prisma/seed.ts");
console.log("\n[db-fresh] RESET COMPLETADO — ejecute: npm run dev");
console.log("[db-fresh] Luego: login admin@everex.local / everex123");
