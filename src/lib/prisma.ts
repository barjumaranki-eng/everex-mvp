import fs from "fs";

import path from "path";

import { PrismaClient } from "@prisma/client";

import { loadProjectEnv } from "@/lib/load-env";

import { describeDatabaseUrl, syncDatabaseUrlEnv } from "@/lib/database-url";



type GlobalPrisma = {

  prisma?: PrismaClient;

  /** mtimeMs de `.prisma/client/index.js` tras el último cliente creado. */

  prismaClientArtifactMtimeMs?: number;

  prismaLogged?: boolean;

  envLoaded?: boolean;

};



const globalForPrisma = globalThis as unknown as GlobalPrisma;



function ensureEnvLoaded(): string[] {

  if (!globalForPrisma.envLoaded) {

    globalForPrisma.envLoaded = true;

    return loadProjectEnv();

  }

  return [];

}



function prismaGeneratedClientMtimeMs(): number {

  try {

    const clientIndex = path.join(process.cwd(), "node_modules", ".prisma", "client", "index.js");

    return fs.statSync(clientIndex).mtimeMs;

  } catch {

    return 0;

  }

}



function buildPrismaClient(): PrismaClient {

  const envFiles = ensureEnvLoaded();

  const databaseUrl = syncDatabaseUrlEnv();

  const logLevel: ("error" | "warn")[] = process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"];



  return new PrismaClient({

    datasources: { db: { url: databaseUrl } },

    log: logLevel,

  });

}



function ensurePrismaClient(): PrismaClient {

  if (process.env.NODE_ENV === "production") {

    globalForPrisma.prisma ??= buildPrismaClient();

    if (!globalForPrisma.prismaLogged) {

      globalForPrisma.prismaLogged = true;

      const info = describeDatabaseUrl();

      console.log("[prisma] DATABASE_URL resolved:", info.resolved);

      console.log("[prisma] database file:", info.database);

    }

    return globalForPrisma.prisma;

  }



  const artifactMtime = prismaGeneratedClientMtimeMs();

  const prev = globalForPrisma.prismaClientArtifactMtimeMs;

  if (globalForPrisma.prisma && prev !== undefined && prev !== artifactMtime) {

    void globalForPrisma.prisma.$disconnect();

    globalForPrisma.prisma = undefined;

    globalForPrisma.prismaLogged = false;

  }

  globalForPrisma.prismaClientArtifactMtimeMs = artifactMtime;



  globalForPrisma.prisma ??= buildPrismaClient();

  if (!globalForPrisma.prismaLogged) {

    globalForPrisma.prismaLogged = true;

    const info = describeDatabaseUrl();

    console.log("[prisma] cliente inicializado (desarrollo)");

    console.log("[prisma] DATABASE_URL resolved:", info.resolved);

    console.log("[prisma] env files:", info.envFilesLoaded.length ? info.envFilesLoaded.join(", ") : "(Next inyectó env)");

    console.log("[prisma] database file:", info.database);

  }

  return globalForPrisma.prisma;

}



/**

 * Proxy: en desarrollo, cada acceso puede comprobar si cambió el cliente generado

 * (p. ej. tras `npx prisma generate`) y recrear PrismaClient sin reiniciar a mano.

 */

export const prisma = new Proxy({} as PrismaClient, {

  get(_target, prop) {

    const real = ensurePrismaClient();

    const value = Reflect.get(real as unknown as object, prop, real);

    if (typeof value === "function") {

      return value.bind(real);

    }

    return value;

  },

}) as PrismaClient;


