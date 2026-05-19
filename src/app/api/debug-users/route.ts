import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncDatabaseUrlEnv } from "@/lib/database-url";

export const dynamic = "force-dynamic";

/** Email que debe usarse en el formulario de login. */
const ALYSON_LOGIN_EMAIL = "alyson@everex.local";
/** Variante histórica en seed/scripts (doble «l»). */
const ALYSON_LEGACY_EMAIL = "allyson@everex.local";
const ALYSON_PASSWORD = "everex123";

async function listUsers() {
  return prisma.user.findMany({
    orderBy: { email: "asc" },
    select: { email: true, role: true, active: true },
  });
}

async function ensureAlysonLoginUser(): Promise<{
  created: boolean;
  email: string;
  passwordOk: boolean;
}> {
  const existing = await prisma.user.findUnique({
    where: { email: ALYSON_LOGIN_EMAIL },
    select: { id: true, passwordHash: true, role: true, active: true },
  });

  if (existing?.passwordHash) {
    const passwordOk = await bcrypt.compare(ALYSON_PASSWORD, existing.passwordHash);
    if (passwordOk && existing.role === UserRole.OPERACIONES && existing.active) {
      return { created: false, email: ALYSON_LOGIN_EMAIL, passwordOk: true };
    }
    const passwordHash = await bcrypt.hash(ALYSON_PASSWORD, 10);
    await prisma.user.update({
      where: { email: ALYSON_LOGIN_EMAIL },
      data: {
        passwordHash,
        role: UserRole.OPERACIONES,
        active: true,
        displayName: "Alyson",
      },
    });
    return { created: false, email: ALYSON_LOGIN_EMAIL, passwordOk: true };
  }

  const legacy = await prisma.user.findUnique({
    where: { email: ALYSON_LEGACY_EMAIL },
    select: { role: true, active: true },
  });

  const passwordHash = await bcrypt.hash(ALYSON_PASSWORD, 10);
  await prisma.user.create({
    data: {
      email: ALYSON_LOGIN_EMAIL,
      passwordHash,
      role: legacy?.role === UserRole.OPERACIONES ? UserRole.OPERACIONES : UserRole.OPERACIONES,
      displayName: "Alyson",
      active: legacy?.active ?? true,
    },
  });

  const passwordOk = await bcrypt.compare(ALYSON_PASSWORD, passwordHash);
  return { created: true, email: ALYSON_LOGIN_EMAIL, passwordOk };
}

/** Misma instancia `prisma` que `login.actions.ts`. */
export async function GET() {
  const databaseUrl = syncDatabaseUrlEnv();
  const cwd = process.cwd();

  let users = await listUsers();
  const hadLoginEmailBefore = users.some((u) => u.email === ALYSON_LOGIN_EMAIL);

  let repair = { created: false, email: ALYSON_LOGIN_EMAIL, passwordOk: false };
  if (!hadLoginEmailBefore) {
    repair = await ensureAlysonLoginUser();
    users = await listUsers();
  } else {
    const row = await prisma.user.findUnique({
      where: { email: ALYSON_LOGIN_EMAIL },
      select: { passwordHash: true },
    });
    repair.passwordOk = !!(row?.passwordHash && (await bcrypt.compare(ALYSON_PASSWORD, row.passwordHash)));
  }

  const loginProbe = await prisma.user.findUnique({
    where: { email: ALYSON_LOGIN_EMAIL },
    select: { id: true, role: true, active: true },
  });

  return NextResponse.json({
    databaseUrl,
    cwd,
    users,
    loginEmailExpected: ALYSON_LOGIN_EMAIL,
    loginProbe: {
      found: !!loginProbe,
      role: loginProbe?.role ?? null,
      active: loginProbe?.active ?? null,
    },
    meta: {
      hadLoginEmailBefore,
      hasLoginEmailAfter: users.some((u) => u.email === ALYSON_LOGIN_EMAIL),
      alysonCreated: repair.created,
      passwordOk: repair.passwordOk,
      legacyEmailInDb: users.some((u) => u.email === ALYSON_LEGACY_EMAIL),
    },
  });
}
