import "./load-env.mjs";
import { createScriptPrismaClient } from "./prisma-client.mjs";

const prisma = createScriptPrismaClient();
try {
  console.log("DATABASE_URL:", process.env.DATABASE_URL);
  const users = await prisma.user.findMany({
    orderBy: { email: "asc" },
    select: { email: true, role: true, displayName: true, active: true },
  });
  console.log(JSON.stringify(users, null, 2));
} finally {
  await prisma.$disconnect();
}
