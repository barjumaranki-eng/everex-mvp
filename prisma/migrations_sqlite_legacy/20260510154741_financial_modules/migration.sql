-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "description" TEXT NOT NULL,
    "proofImage" TEXT,
    "dayKey" TEXT NOT NULL,
    "bankMovementId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Expense_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_bankMovementId_fkey" FOREIGN KEY ("bankMovementId") REFERENCES "BankMovement" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientReceivable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "originalAmount" DECIMAL NOT NULL,
    "balance" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dayKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    CONSTRAINT "ClientReceivable_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClientReceivable_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientReceivablePayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "receivableId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentDate" DATETIME NOT NULL,
    "channel" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "reference" TEXT,
    "proofImage" TEXT,
    "dayKey" TEXT NOT NULL,
    "bankMovementId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientReceivablePayment_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "ClientReceivable" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientReceivablePayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ClientReceivablePayment_bankMovementId_fkey" FOREIGN KEY ("bankMovementId") REFERENCES "BankMovement" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ClientReceivablePayment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EverexPayable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creditorName" TEXT NOT NULL,
    "creditorType" TEXT NOT NULL,
    "operatorId" TEXT,
    "originalAmount" DECIMAL NOT NULL,
    "balance" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dayKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    CONSTRAINT "EverexPayable_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EverexPayable_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EverexPayablePayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payableId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentDate" DATETIME NOT NULL,
    "channel" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "reference" TEXT,
    "proofImage" TEXT,
    "dayKey" TEXT NOT NULL,
    "bankMovementId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EverexPayablePayment_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "EverexPayable" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EverexPayablePayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EverexPayablePayment_bankMovementId_fkey" FOREIGN KEY ("bankMovementId") REFERENCES "BankMovement" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EverexPayablePayment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bankAccountId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    CONSTRAINT "BankImportBatch_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BankImportBatch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankStatementLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bankAccountId" TEXT NOT NULL,
    "batchId" TEXT,
    "rowDate" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "credit" DECIMAL,
    "debit" DECIMAL,
    "balanceAfter" DECIMAL,
    "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "suggestedMovementId" TEXT,
    "matchedBankMovementId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankStatementLine_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BankStatementLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BankImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankStatementLine_matchedBankMovementId_fkey" FOREIGN KEY ("matchedBankMovementId") REFERENCES "BankMovement" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Expense_bankMovementId_key" ON "Expense"("bankMovementId");

-- CreateIndex
CREATE INDEX "Expense_dayKey_idx" ON "Expense"("dayKey");

-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");

-- CreateIndex
CREATE INDEX "ClientReceivable_clientId_active_idx" ON "ClientReceivable"("clientId", "active");

-- CreateIndex
CREATE INDEX "ClientReceivable_dayKey_idx" ON "ClientReceivable"("dayKey");

-- CreateIndex
CREATE UNIQUE INDEX "ClientReceivablePayment_bankMovementId_key" ON "ClientReceivablePayment"("bankMovementId");

-- CreateIndex
CREATE INDEX "ClientReceivablePayment_receivableId_idx" ON "ClientReceivablePayment"("receivableId");

-- CreateIndex
CREATE INDEX "ClientReceivablePayment_dayKey_idx" ON "ClientReceivablePayment"("dayKey");

-- CreateIndex
CREATE INDEX "EverexPayable_active_idx" ON "EverexPayable"("active");

-- CreateIndex
CREATE INDEX "EverexPayable_dayKey_idx" ON "EverexPayable"("dayKey");

-- CreateIndex
CREATE UNIQUE INDEX "EverexPayablePayment_bankMovementId_key" ON "EverexPayablePayment"("bankMovementId");

-- CreateIndex
CREATE INDEX "EverexPayablePayment_payableId_idx" ON "EverexPayablePayment"("payableId");

-- CreateIndex
CREATE INDEX "EverexPayablePayment_dayKey_idx" ON "EverexPayablePayment"("dayKey");

-- CreateIndex
CREATE INDEX "BankImportBatch_bankAccountId_idx" ON "BankImportBatch"("bankAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatementLine_matchedBankMovementId_key" ON "BankStatementLine"("matchedBankMovementId");

-- CreateIndex
CREATE INDEX "BankStatementLine_bankAccountId_rowDate_idx" ON "BankStatementLine"("bankAccountId", "rowDate");

-- CreateIndex
CREATE INDEX "BankStatementLine_status_idx" ON "BankStatementLine"("status");
