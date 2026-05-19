-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "displayName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MexicoProvider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GTQ',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UsdtPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "counterparty" TEXT NOT NULL,
    "operatorId" TEXT,
    "clientId" TEXT,
    "providerId" TEXT,
    "amountMxn" DECIMAL,
    "gtqTotal" DECIMAL NOT NULL,
    "usdtAmount" DECIMAL NOT NULL,
    "rateXe" DECIMAL,
    "rateMxnToGtq" DECIMAL,
    "notes" TEXT,
    "dayKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    CONSTRAINT "UsdtPurchase_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "UsdtPurchase_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "UsdtPurchase_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MexicoProvider" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "UsdtPurchase_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OtcOperation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ref" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "usdtAmount" DECIMAL NOT NULL,
    "rateFiatPerUsdt" DECIMAL NOT NULL,
    "totalFiat" DECIMAL NOT NULL,
    "fiatCurrency" TEXT NOT NULL,
    "pnlBasisGtq" DECIMAL NOT NULL,
    "profitGtq" DECIMAL,
    "profitUsd" DECIMAL,
    "notes" TEXT,
    "dayKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    CONSTRAINT "OtcOperation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OtcOperation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OtcAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operationId" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "operatorId" TEXT,
    "bankAccountId" TEXT,
    "amount" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GTQ',
    "reference" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OtcAllocation_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "OtcOperation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OtcAllocation_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OtcAllocation_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StatementEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityKind" TEXT NOT NULL,
    "operatorId" TEXT,
    "clientId" TEXT,
    "providerId" TEXT,
    "amountGtq" DECIMAL NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "dayKey" TEXT NOT NULL,
    "postedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    CONSTRAINT "StatementEntry_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StatementEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StatementEntry_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MexicoProvider" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StatementEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankMovement" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    CONSTRAINT "BankMovement_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BankMovement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Operator_name_key" ON "Operator"("name");

-- CreateIndex
CREATE INDEX "UsdtPurchase_dayKey_idx" ON "UsdtPurchase"("dayKey");

-- CreateIndex
CREATE INDEX "UsdtPurchase_counterparty_idx" ON "UsdtPurchase"("counterparty");

-- CreateIndex
CREATE INDEX "UsdtPurchase_providerId_idx" ON "UsdtPurchase"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "OtcOperation_ref_key" ON "OtcOperation"("ref");

-- CreateIndex
CREATE INDEX "OtcOperation_clientId_idx" ON "OtcOperation"("clientId");

-- CreateIndex
CREATE INDEX "OtcOperation_dayKey_idx" ON "OtcOperation"("dayKey");

-- CreateIndex
CREATE INDEX "OtcOperation_side_idx" ON "OtcOperation"("side");

-- CreateIndex
CREATE INDEX "OtcAllocation_operationId_idx" ON "OtcAllocation"("operationId");

-- CreateIndex
CREATE INDEX "StatementEntry_entityKind_operatorId_postedAt_idx" ON "StatementEntry"("entityKind", "operatorId", "postedAt");

-- CreateIndex
CREATE INDEX "StatementEntry_entityKind_clientId_postedAt_idx" ON "StatementEntry"("entityKind", "clientId", "postedAt");

-- CreateIndex
CREATE INDEX "StatementEntry_entityKind_providerId_postedAt_idx" ON "StatementEntry"("entityKind", "providerId", "postedAt");

-- CreateIndex
CREATE INDEX "StatementEntry_dayKey_idx" ON "StatementEntry"("dayKey");

-- CreateIndex
CREATE INDEX "BankMovement_bankAccountId_date_idx" ON "BankMovement"("bankAccountId", "date");

-- CreateIndex
CREATE INDEX "BankMovement_status_idx" ON "BankMovement"("status");
