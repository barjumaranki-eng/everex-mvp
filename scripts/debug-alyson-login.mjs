/**
 * Diagnóstico + reparación Alyson (misma DATABASE_URL que login.actions / Next).
 * Uso: node scripts/debug-alyson-login.mjs
 */
import { envFilesLoaded, databaseUrlResolved } from "./load-env.mjs";
import { createScriptPrismaClient } from "./prisma-client.mjs";
import bcrypt from "bcryptjs";

const FERNANDA_EMAIL = "fernanda@everex.local";
const ALYSON_EMAIL = "allyson@everex.local";
const PASSWORD = "everex123";
const ALYSON_DISPLAY_NAME = "Alyson";
const APP_ROLES = new Set(["ADMIN", "TESORERIA", "OPERACIONES", "CONCILIACION", "LECTURA"]);

const prisma = createScriptPrismaClient();

let alysonOk = false;
let passwordOk = false;
let sameRoleAsFernanda = false;

console.log("=== debug-alyson-login ===\n");
console.log("DATABASE_URL:", databaseUrlResolved);
console.log("archivos .env cargados:", envFilesLoaded.length ? envFilesLoaded.join(", ") : "(ninguno)");

try {
  const allUsers = await prisma.user.findMany({
    orderBy: { email: "asc" },
    select: { email: true, role: true, displayName: true, passwordHash: true, active: true },
  });

  console.log("\n--- Usuarios (" + allUsers.length + ") ---");
  for (const u of allUsers) {
    console.log(
      `  ${u.email} | role=${u.role} | displayName=${u.displayName ?? "(null)"} | passwordHash=${u.passwordHash ? "sí" : "no"}`,
    );
  }

  let fernanda = await prisma.user.findUnique({
    where: { email: FERNANDA_EMAIL },
    select: { email: true, role: true, active: true, passwordHash: true },
  });
  console.log("\nusuario Fernanda encontrado:", fernanda ? "sí" : "no");
  if (fernanda) console.log("role Fernanda:", fernanda.role);

  if (!fernanda) {
    console.error("ERROR: Fernanda no existe en esta BD");
    process.exit(1);
  }

  let alyson = await prisma.user.findUnique({
    where: { email: ALYSON_EMAIL },
    select: { email: true, role: true, active: true, passwordHash: true },
  });
  console.log("usuario alyson encontrado:", alyson ? "sí" : "no");

  if (!alyson) {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    alyson = await prisma.user.create({
      data: {
        email: ALYSON_EMAIL,
        passwordHash,
        role: fernanda.role,
        displayName: ALYSON_DISPLAY_NAME,
        active: fernanda.active,
      },
      select: { email: true, role: true, active: true, passwordHash: true },
    });
    console.log("[fix] Alyson creada");
  } else {
    const updates = {};
    if (alyson.role !== fernanda.role) updates.role = fernanda.role;
    if (!alyson.passwordHash || !(await bcrypt.compare(PASSWORD, alyson.passwordHash))) {
      updates.passwordHash = await bcrypt.hash(PASSWORD, 10);
    }
    if (!alyson.active) updates.active = true;
    if (Object.keys(updates).length > 0) {
      alyson = await prisma.user.update({
        where: { email: ALYSON_EMAIL },
        data: updates,
        select: { email: true, role: true, active: true, passwordHash: true },
      });
      console.log("[fix] Alyson actualizada");
    }
  }

  console.log("role de Alyson:", alyson.role);
  passwordOk = await bcrypt.compare(PASSWORD, alyson.passwordHash);
  console.log('bcrypt.compare("everex123", alyson.passwordHash):', passwordOk);
  sameRoleAsFernanda = alyson.role === fernanda.role;
  console.log("comparar role Alyson vs Fernanda:", sameRoleAsFernanda);

  alysonOk = !!alyson && alyson.active && APP_ROLES.has(alyson.role);

  console.log("\n=== RESULTADO ===");
  console.log("Alyson OK:", alysonOk);
  console.log("password OK:", passwordOk);
  console.log("same role as Fernanda:", sameRoleAsFernanda);

  if (!alysonOk || !passwordOk || !sameRoleAsFernanda) process.exit(1);
} catch (e) {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
