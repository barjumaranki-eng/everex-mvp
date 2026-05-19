-- AlterTable
ALTER TABLE "BankAccount" ADD COLUMN "reportedBalance" DECIMAL;
ALTER TABLE "BankAccount" ADD COLUMN "reportedBalanceAt" DATETIME;

-- CreateTable
CREATE TABLE "UsdtPurchaseEditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    CONSTRAINT "UsdtPurchaseEditLog_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "UsdtPurchase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UsdtPurchaseEditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankOpeningBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bankAccountId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "effectiveAt" DATETIME NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    CONSTRAINT "BankOpeningBalance_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankOpeningBalance_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BankOpeningBalance_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankOpeningBalanceAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "openingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    CONSTRAINT "BankOpeningBalanceAudit_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "BankOpeningBalance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankOpeningBalanceAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "UsdtPurchaseEditLog_purchaseId_createdAt_idx" ON "UsdtPurchaseEditLog"("purchaseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankOpeningBalance_bankAccountId_key" ON "BankOpeningBalance"("bankAccountId");

-- CreateIndex
CREATE INDEX "BankOpeningBalance_effectiveAt_idx" ON "BankOpeningBalance"("effectiveAt");

-- CreateIndex
CREATE INDEX "BankOpeningBalanceAudit_openingId_idx" ON "BankOpeningBalanceAudit"("openingId");
