import { existsSync, readFileSync } from "fs";
import path from "path";

/** Mismo orden que Next.js: archivos posteriores sobrescriben. */
const ENV_FILES = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.production",
  ".env.production.local",
] as const;

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
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

/** Carga .env* desde la raíz del proyecto (solo Node/scripts; Next ya lo hace). */
export function loadProjectEnv(root = process.cwd()): string[] {
  const loaded: string[] = [];
  for (const name of ENV_FILES) {
    const filePath = path.join(root, name);
    if (!existsSync(filePath)) continue;
    const vars = parseEnvFile(readFileSync(filePath, "utf8"));
    for (const [key, val] of Object.entries(vars)) {
      process.env[key] = val;
    }
    loaded.push(filePath);
  }
  return loaded;
}
