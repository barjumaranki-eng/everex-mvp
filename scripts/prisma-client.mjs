import "./load-env.mjs";
import { PrismaClient } from "@prisma/client";

export function createScriptPrismaClient() {
  return new PrismaClient({
    datasources: {
      db: { url: process.env.DATABASE_URL },
    },
  });
}
