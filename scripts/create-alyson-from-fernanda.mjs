/**
 * Clona el rol de Fernanda en allyson@everex.local (misma DATABASE_URL que Next).
 * Uso: node scripts/create-alyson-from-fernanda.mjs
 */
import "./load-env.mjs";
import { createScriptPrismaClient } from "./prisma-client.mjs";
import bcrypt from "bcryptjs";

const FERNANDA_EMAIL = "fernanda@everex.local";
const ALYSON_EMAIL = "allyson@everex.local";
const ALYSON_PASSWORD = "everex123";
const ALYSON_DISPLAY_NAME = "Alyson";
const APP_ROLES = new Set(["ADMIN", "TESORERIA", "OPERACIONES", "CONCILIACION", "LECTURA"]);

const prisma = createScriptPrismaClient();

console.log("--- create-alyson-from-fernanda ---");
console.log("DATABASE_URL:", process.env.DATABASE_URL);

try {
  let fernanda = await prisma.user.findUnique({
    where: { email: FERNANDA_EMAIL },
    select: { id: true, email: true, role: true, displayName: true, active: true },
  });
  if (!fernanda) {
    fernanda = await prisma.user.findFirst({
      where: { displayName: { contains: "Fernanda" } },
      select: { id: true, email: true, role: true, displayName: true, active: true },
    });
  }
  if (!fernanda || !APP_ROLES.has(fernanda.role)) {
    console.error("ERROR: Fernanda no encontrada o rol inválido");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(ALYSON_PASSWORD, 10);
  const alyson = await prisma.user.upsert({
    where: { email: ALYSON_EMAIL },
    update: {
      passwordHash,
      role: fernanda.role,
      displayName: ALYSON_DISPLAY_NAME,
      active: fernanda.active,
    },
    create: {
      email: ALYSON_EMAIL,
      passwordHash,
      role: fernanda.role,
      displayName: ALYSON_DISPLAY_NAME,
      active: fernanda.active,
    },
    select: { email: true, role: true, passwordHash: true },
  });

  const passwordOk = await bcrypt.compare(ALYSON_PASSWORD, alyson.passwordHash);
  console.log("Fernanda role:", fernanda.role);
  console.log("Alyson role:", alyson.role);
  console.log("password OK:", passwordOk);
  if (!passwordOk || alyson.role !== fernanda.role) process.exit(1);
  console.log("\nOK — allyson@everex.local / everex123");
} catch (e) {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
