/**
 * Valida credenciales y rutas RBAC de Alyson vs Fernanda (misma DATABASE_URL que Next).
 * Uso: node scripts/verify-alyson-login.mjs
 */
import "./load-env.mjs";
import { createScriptPrismaClient } from "./prisma-client.mjs";
import bcrypt from "bcryptjs";

const prisma = createScriptPrismaClient();

function canAccessPathname(role, pathname) {
  const p = pathname !== "/" && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const RE = {
    dashboard: /^\/dashboard(\/.*)?$/,
    bancos: /^\/bancos(\/.*)?$/,
    gastos: /^\/gastos(\/.*)?$/,
    operadores: /^\/operadores(\/.*)?$/,
    clientes: /^\/clientes(\/.*)?$/,
    estadoFin: /^\/estado-financiero(\/.*)?$/,
  };
  const match = (patterns) => patterns.some((re) => re.test(p));
  if (role === "ADMIN") return true;
  if (RE.estadoFin.test(p)) return false;
  if (role === "OPERACIONES" || role === "CONCILIACION") {
    return match([RE.dashboard, RE.bancos, RE.gastos, RE.operadores, RE.clientes]);
  }
  return false;
}

const PATHS = ["/dashboard", "/bancos", "/gastos", "/operadores", "/clientes"];

try {
  console.log("[verify] DATABASE_URL:", process.env.DATABASE_URL);

  const [fernanda, alyson, userCount] = await Promise.all([
    prisma.user.findUnique({
      where: { email: "fernanda@everex.local" },
      select: { email: true, role: true, active: true, passwordHash: true },
    }),
    prisma.user.findUnique({
      where: { email: "allyson@everex.local" },
      select: { email: true, role: true, active: true, passwordHash: true },
    }),
    prisma.user.count(),
  ]);

  console.log("[verify] userCount:", userCount);
  if (!fernanda) throw new Error("Fernanda no encontrada");
  if (!alyson) throw new Error("Alyson no encontrada");

  const pwOk = await bcrypt.compare("everex123", alyson.passwordHash);
  console.log("Alyson password everex123:", pwOk ? "OK" : "FAIL");
  console.log("Alyson role:", alyson.role, "| Fernanda role:", fernanda.role);
  console.log("Roles iguales:", alyson.role === fernanda.role ? "OK" : "FAIL");

  if (!pwOk || alyson.role !== fernanda.role || !alyson.active) process.exit(1);

  for (const path of PATHS) {
    const ok = canAccessPathname(alyson.role, path);
    console.log(`  ${path}: ${ok ? "OK" : "FAIL"}`);
    if (!ok) process.exit(1);
  }

  console.log("\nverify-alyson-login: todo OK");
} catch (e) {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
