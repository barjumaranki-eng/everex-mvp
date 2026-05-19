import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { describeDatabaseUrl } from "@/lib/database-url";

export const dynamic = "force-dynamic";

export async function GET() {
  const info = describeDatabaseUrl();

  const [userCount, alyson, fernanda] = await Promise.all([
    prisma.user.count(),
    prisma.user.findUnique({ where: { email: "allyson@everex.local" }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: "fernanda@everex.local" }, select: { id: true } }),
  ]);

  return NextResponse.json({
    databaseUrlHost: info.host,
    databaseName: info.database,
    databaseSchema: info.schema,
    databaseUrlResolved: info.resolved,
    envFilesLoaded: info.envFilesLoaded,
    hasAlyson: !!alyson,
    hasFernanda: !!fernanda,
    userCount,
  });
}
