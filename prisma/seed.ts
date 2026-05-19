import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD = "everex123";

const USERS: { email: string; role: UserRole; displayName: string }[] = [
  { email: "ibrahim@everex.local", role: UserRole.ADMIN, displayName: "Ibrahim" },
  { email: "fernanda@everex.local", role: UserRole.OPERACIONES, displayName: "Fernanda" },
  { email: "alyson@everex.local", role: UserRole.OPERACIONES, displayName: "Alyson" },
];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        passwordHash,
        role: u.role,
        displayName: u.displayName,
        active: true,
      },
      create: {
        email: u.email,
        passwordHash,
        role: u.role,
        displayName: u.displayName,
        active: true,
      },
    });
  }

  const expectedEmails = USERS.map((u) => u.email);
  const rows = await prisma.user.findMany({
    where: { email: { in: expectedEmails } },
    select: { email: true, role: true, displayName: true, active: true },
    orderBy: { email: "asc" },
  });

  for (const email of expectedEmails) {
    if (!rows.some((r) => r.email === email)) {
      throw new Error(`Usuario faltante tras seed: ${email}`);
    }
  }

  const fernanda = rows.find((r) => r.email === "fernanda@everex.local");
  const alyson = rows.find((r) => r.email === "alyson@everex.local");
  if (!fernanda) {
    throw new Error("fernanda@everex.local no encontrada tras seed");
  }
  if (!alyson || alyson.role !== fernanda.role) {
    throw new Error(`alyson@everex.local debe tener el mismo rol que Fernanda (${fernanda.role})`);
  }

  console.log("Seed OK:", rows.map((r) => `${r.email} (${r.role}, ${r.displayName ?? "—"})`).join(", "));
  console.log("Alyson creada correctamente");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
