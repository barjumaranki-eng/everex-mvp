/**
 * Reset selectivo: solo compras USDT y datos auxiliares ligados a ellas.
 *
 * NO borra: clientes, operadores, proveedores, cuentas bancarias, operaciones OTC,
 * gastos, deudas, usuarios, movimientos bancarios salvo los detectados como ligados
 * a compras USDT (referencia = id de compra o movimiento solo usado por cuadradora
 * asociada al asiento de compra).
 *
 * Uso:
 *   node scripts/reset-purchases-only.mjs           # solo cuenta (dry-run)
 *   node scripts/reset-purchases-only.mjs --execute # borra (requiere DATABASE_URL)
 *
 * Regla de consistencia del inventario USDT (referencia; el cálculo real incluye
 * pipe MXN, spread, etc. en src/lib/inventory.ts):
 *   inventario ≈ Σ(UsdtPurchase.usdtAmount) + otros ingresos operacionales
 *              − USDT vendidos en OTC (cliente compra USDT)
 *              − Σ(OperatorMxnUsdtSettlement.usdtPaid)
 *
 * No usa operatedAt ni campos fuera del esquema Prisma actual.
 */

import { createScriptPrismaClient } from "./prisma-client.mjs";

const REF_TYPE = "UsdtPurchase";
const PURCHASE_KIND = "USDT_PURCHASE";

async function main() {
  const execute = process.argv.includes("--execute");
  const prisma = createScriptPrismaClient();

  try {
    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL no definida (cargue .env en la raíz del proyecto o exporte la variable).");
      process.exitCode = 1;
      return;
    }

    const [
      purchaseCount,
      editLogCount,
      stmtPurchaseCount,
      otcCount,
      operatorCount,
      clientCount,
    ] = await Promise.all([
      prisma.usdtPurchase.count(),
      prisma.usdtPurchaseEditLog.count(),
      prisma.statementEntry.count({
        where: { refType: REF_TYPE, kind: PURCHASE_KIND },
      }),
      prisma.otcOperation.count(),
      prisma.operator.count(),
      prisma.client.count(),
    ]);

    const stmtOddKind = await prisma.statementEntry.count({
      where: { refType: REF_TYPE, kind: { not: PURCHASE_KIND } },
    });

    const purchaseIds = (await prisma.usdtPurchase.findMany({ select: { id: true } })).map((r) => r.id);

    const stmtRows = await prisma.statementEntry.findMany({
      where: { refType: REF_TYPE },
      select: { id: true, refId: true, kind: true },
    });
    const stmtIds = stmtRows.map((r) => r.id);

    const cuadForStmt = await prisma.cuadradoraAdjustment.count({
      where: { statementEntryId: { in: stmtIds.length ? stmtIds : ["__none__"] } },
    });

    const bmByReference =
      purchaseIds.length > 0
        ? await prisma.bankMovement.count({
            where: { reference: { in: purchaseIds } },
          })
        : 0;

    console.log("--- reset-purchases-only (dry-run log) ---");
    console.log("UsdtPurchase rows:", purchaseCount);
    console.log("UsdtPurchaseEditLog rows:", editLogCount);
    console.log(`StatementEntry (${REF_TYPE} / ${PURCHASE_KIND}):`, stmtPurchaseCount);
    console.log(`StatementEntry (${REF_TYPE}, cualquier kind):`, stmtRows.length, `(odd kind ≠ ${PURCHASE_KIND}: ${stmtOddKind})`);
    console.log("CuadradoraAdjustment ligadas a esos asientos:", cuadForStmt);
    console.log("BankMovement con reference = id de compra:", bmByReference);
    console.log("(referencia) filas OTC / operadores / clientes (no se borran):", otcCount, operatorCount, clientCount);

    if (!execute) {
      console.log("\nDry-run: no se borró nada. Para ejecutar: node scripts/reset-purchases-only.mjs --execute");
      return;
    }

    const otcBefore = otcCount;
    const opBefore = operatorCount;

    await prisma.$transaction(
      async (tx) => {
        const pIds = (await tx.usdtPurchase.findMany({ select: { id: true } })).map((r) => r.id);
        const stmts = await tx.statementEntry.findMany({
          where: { refType: REF_TYPE },
          select: { id: true },
        });
        const sIds = stmts.map((s) => s.id);

        const cuads = await tx.cuadradoraAdjustment.findMany({
          where: { statementEntryId: { in: sIds.length ? sIds : ["__none__"] } },
          select: { id: true, bankMovementId: true },
        });
        const bmFromCuad = [...new Set(cuads.map((c) => c.bankMovementId).filter(Boolean))];

        const deletedCuad = await tx.cuadradoraAdjustment.deleteMany({
          where: { statementEntryId: { in: sIds.length ? sIds : ["__none__"] } },
        });
        console.log("Deleted CuadradoraAdjustment (por asiento compra):", deletedCuad.count);

        const deletedStmt = await tx.statementEntry.deleteMany({
          where: { refType: REF_TYPE },
        });
        console.log("Deleted StatementEntry (refType UsdtPurchase):", deletedStmt.count);

        const bmRefIds =
          pIds.length > 0
            ? (await tx.bankMovement.findMany({ where: { reference: { in: pIds } }, select: { id: true } })).map(
                (b) => b.id,
              )
            : [];
        const bmCandidateIds = [...new Set([...bmFromCuad, ...bmRefIds])];

        let deletedBm = 0;
        for (const bmId of bmCandidateIds) {
          const bm = await tx.bankMovement.findUnique({
            where: { id: bmId },
            select: {
              id: true,
              sourceOtcAllocationId: true,
              expense: { select: { id: true } },
              receivablePayment: { select: { id: true } },
              payablePayment: { select: { id: true } },
              matchedByStatementLine: { select: { id: true } },
              cuadradoraAdjustment: { select: { id: true } },
            },
          });
          if (!bm) continue;
          const blocked =
            bm.expense ||
            bm.receivablePayment ||
            bm.payablePayment ||
            bm.matchedByStatementLine ||
            bm.cuadradoraAdjustment ||
            bm.sourceOtcAllocationId;
          if (blocked) {
            console.warn("  Skip BankMovement (aún referenciado):", bmId);
            continue;
          }
          await tx.bankMovement.deleteMany({ where: { id: bmId } });
          deletedBm += 1;
        }
        console.log("Deleted BankMovement (solo huérfanos de compra / cuadradora compra):", deletedBm);

        const deletedPurchases = await tx.usdtPurchase.deleteMany({});
        console.log("Deleted UsdtPurchase (cascade edit logs):", deletedPurchases.count);
      },
      { maxWait: 60_000, timeout: 120_000 },
    );

    const [otcAfter, opAfter, purAfter, stmtAfter] = await Promise.all([
      prisma.otcOperation.count(),
      prisma.operator.count(),
      prisma.usdtPurchase.count(),
      prisma.statementEntry.count({ where: { refType: REF_TYPE } }),
    ]);

    console.log("\n--- post-delete sanity ---");
    console.log("UsdtPurchase restantes:", purAfter, "(esperado 0)");
    console.log("StatementEntry UsdtPurchase restantes:", stmtAfter, "(esperado 0)");
    console.log("OTC operations antes/después:", otcBefore, otcAfter, otcBefore === otcAfter ? "OK" : "ERROR");
    console.log("Operadores antes/después:", opBefore, opAfter, opBefore === opAfter ? "OK" : "ERROR");
    console.log("\nListo. El dashboard recalcula inventario sin filas UsdtPurchase al cargar.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
