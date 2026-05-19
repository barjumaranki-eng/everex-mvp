import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canExportOperatorLedger } from "@/lib/authz";
import { buildOperatorMajorBook, majorBookToCsv, parseOperatorLedgerRange } from "@/lib/operator-major-book";

function ledgerParamsFromUrl(url: URL): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {};
  for (const k of ["range", "day", "year", "from", "to"] as const) {
    const v = url.searchParams.get(k);
    if (v) out[k] = v;
  }
  return out;
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getSessionUser();
  if (!user || !canExportOperatorLedger(user)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id: operatorId } = await context.params;
  const op = await prisma.operator.findUnique({ where: { id: operatorId }, select: { name: true } });
  if (!op) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const url = new URL(req.url);
  const ledgerSp = ledgerParamsFromUrl(url);
  const { periodLabel, start, endExclusive } = parseOperatorLedgerRange(ledgerSp);
  const book = await buildOperatorMajorBook(operatorId, start, endExclusive, periodLabel);
  const csv = majorBookToCsv(book);

  const safe = op.name.replace(/[^\w\-]+/g, "_").slice(0, 40);
  const fname = `libro-operador-${safe}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fname}"`,
    },
  });
}
