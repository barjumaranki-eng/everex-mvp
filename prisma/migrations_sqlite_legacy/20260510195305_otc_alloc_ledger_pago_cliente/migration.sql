-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BankMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bankAccountId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "type" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GTQ',
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "matchedNote" TEXT,
    "sourceOtcId" TEXT,
    "sourceOtcAllocationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    CONSTRAINT "BankMovement_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BankMovement_sourceOtcAllocationId_fkey" FOREIGN KEY ("sourceOtcAllocationId") REFERENCES "OtcAllocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankMovement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BankMovement" ("amount", "bankAccountId", "createdAt", "createdByUserId", "currency", "date", "description", "id", "matchedNote", "reference", "sourceOtcId", "status", "type") SELECT "amount", "bankAccountId", "createdAt", "createdByUserId", "currency", "date", "description", "id", "matchedNote", "reference", "sourceOtcId", "status", "type" FROM "BankMovement";
DROP TABLE "BankMovement";
ALTER TABLE "new_BankMovement" RENAME TO "BankMovement";
CREATE UNIQUE INDEX "BankMovement_sourceOtcAllocationId_key" ON "BankMovement"("sourceOtcAllocationId");
CREATE INDEX "BankMovement_bankAccountId_date_idx" ON "BankMovement"("bankAccountId", "date");
CREATE INDEX "BankMovement_status_idx" ON "BankMovement"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "StatementEntry_refType_refId_idx" ON "StatementEntry"("refType", "refId");
