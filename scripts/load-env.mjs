/**
 * Carga .env* (mismo orden que Next) y fija DATABASE_URL resuelta (ruta absoluta SQLite).
 * Importar al inicio de todo script: import "./load-env.mjs";
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const ENV_FILES = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.production",
  ".env.production.local",
];

function parseEnvFile(content) {
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

export function loadProjectEnv() {
  const loaded = [];
  for (const name of ENV_FILES) {
    const filePath = join(root, name);
    if (!existsSync(filePath)) continue;
    const vars = parseEnvFile(readFileSync(filePath, "utf8"));
    for (const [key, val] of Object.entries(vars)) {
      process.env[key] = val;
    }
    loaded.push(filePath);
  }
  return { root, loaded };
}

function resolveDatabaseUrl() {
  const raw = process.env.DATABASE_URL?.trim() || "file:./dev.db";
  if (!raw.startsWith("file:")) return raw;
  let filePath = raw.slice("file:".length);
  if (filePath.startsWith("//")) filePath = filePath.slice(2);
  filePath = filePath.replace(/^\/+/, "");
  if (isAbsolute(filePath)) return `file:${filePath}`;
  const normalized = filePath.replace(/^\.\//, "");
  if (normalized === "dev.db" || normalized === "prisma/dev.db") {
    return `file:${resolve(root, "prisma", "dev.db")}`;
  }
  return `file:${resolve(root, filePath)}`;
}

const { loaded } = loadProjectEnv();
process.env.DATABASE_URL = resolveDatabaseUrl();

export const projectRoot = root;
export const envFilesLoaded = loaded;
export const databaseUrlResolved = process.env.DATABASE_URL;

console.log("[load-env] root:", root);
console.log("[load-env] archivos:", loaded.length ? loaded.join(", ") : "(ninguno — solo default)");
console.log("[load-env] DATABASE_URL:", process.env.DATABASE_URL);
