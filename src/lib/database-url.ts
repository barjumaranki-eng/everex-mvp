import path from "path";

const DEFAULT_REL = path.join("prisma", "dev.db");

/** Una sola URL de BD para Next, Prisma CLI y scripts (SQLite → ruta absoluta). */
export function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL?.trim() || `file:./${DEFAULT_REL.replace(/\\/g, "/")}`;

  if (!raw.startsWith("file:")) {
    return raw;
  }

  let filePath = raw.slice("file:".length);
  if (filePath.startsWith("//")) {
    filePath = filePath.slice(2);
  }
  filePath = filePath.replace(/^\/+/, "");

  if (path.isAbsolute(filePath)) {
    return `file:${filePath}`;
  }
  // Prisma CLI: rutas relativas a prisma/ (p. ej. file:./dev.db). Next/scripts: cwd = raíz del repo.
  const normalized = filePath.replace(/^\.\//, "");
  if (normalized === "dev.db" || normalized === "prisma/dev.db") {
    return `file:${path.resolve(process.cwd(), "prisma", "dev.db")}`;
  }
  return `file:${path.resolve(process.cwd(), filePath)}`;
}

export type DatabaseUrlInfo = {
  raw: string;
  resolved: string;
  host: string;
  database: string;
  schema: string;
  envFilesLoaded: string[];
};

export function describeDatabaseUrl(envFilesLoaded: string[] = []): DatabaseUrlInfo {
  const resolved = syncDatabaseUrlEnv();
  if (resolved.startsWith("file:")) {
    const filePath = resolved.slice("file:".length);
    return {
      raw: process.env.DATABASE_URL?.trim() ?? "(default file:./prisma/dev.db)",
      resolved,
      host: "sqlite",
      database: filePath,
      schema: "main",
      envFilesLoaded,
    };
  }

  try {
    const u = new URL(resolved);
    return {
      raw: process.env.DATABASE_URL?.trim() ?? resolved,
      resolved,
      host: u.hostname,
      database: u.pathname.replace(/^\//, "") || u.pathname,
      schema: u.searchParams.get("schema") ?? "public",
      envFilesLoaded,
    };
  } catch {
    return {
      raw: process.env.DATABASE_URL?.trim() ?? resolved,
      resolved,
      host: "(unknown)",
      database: resolved,
      schema: "—",
      envFilesLoaded,
    };
  }
}

/** Alinea `process.env.DATABASE_URL` con la URL que usa PrismaClient. */
export function syncDatabaseUrlEnv(): string {
  const resolved = resolveDatabaseUrl();
  process.env.DATABASE_URL = resolved;
  return resolved;
}
