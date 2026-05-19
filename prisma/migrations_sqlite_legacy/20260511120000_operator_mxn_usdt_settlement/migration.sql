-- Operator MXN → USDT payout (inventario USDT; sin GTQ).
-- StmtEntryKind value OPERATOR_MXN_USDT_PAYOUT is stored as TEXT in SQLite.

CREATE TABLE "OperatorMxnUsdtSettlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ref" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "providerId" TEXT,
    "mxnReceived" REAL NOT NULL,
    "xeReference" REAL NOT NULL,
    "usdtPaid" REAL NOT NULL,
    "gtqRateOptional" REAL,
    "referenceUsdt" REAL NOT NULL,
    "diffUsdt" REAL NOT NULL,
    "notes" TEXT,
    "dayKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    CONSTRAINT "OperatorMxnUsdtSettlement_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OperatorMxnUsdtSettlement_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MexicoProvider" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OperatorMxnUsdtSettlement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OperatorMxnUsdtSettlement_ref_key" ON "OperatorMxnUsdtSettlement"("ref");
CREATE INDEX "OperatorMxnUsdtSettlement_operatorId_dayKey_idx" ON "OperatorMxnUsdtSettlement"("operatorId", "dayKey");
CREATE INDEX "OperatorMxnUsdtSettlement_dayKey_idx" ON "OperatorMxnUsdtSettlement"("dayKey");
