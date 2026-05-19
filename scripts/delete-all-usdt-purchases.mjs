import { createScriptPrismaClient } from "./prisma-client.mjs";

const prisma = createScriptPrismaClient();

async function main() {
  console.log("DATABASE_URL:", process.env.DATABASE_URL);

  const before = await prisma.usdtPurchase.count();
  console.log("UsdtPurchase antes:", before);

  await prisma.usdtPurchaseEditLog.deleteMany({});
  await prisma.statementEntry.deleteMany({
    where: {
      OR: [{ refType: "UsdtPurchase" }, { kind: "USDT_PURCHASE" }],
    },
  });
  await prisma.usdtPurchase.deleteMany({});

  const after = await prisma.usdtPurchase.count();
  console.log("UsdtPurchase después:", after);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
