-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'TESORERIA', 'OPERACIONES', 'CONCILIACION', 'LECTURA');

-- CreateEnum
CREATE TYPE "PurchaseCounterparty" AS ENUM ('OPERATOR', 'CLIENT', 'PROVIDER_MX');

-- CreateEnum
CREATE TYPE "OtcSide" AS ENUM ('CLIENT_BUYS_USDT', 'CLIENT_SELLS_USDT');

-- CreateEnum
CREATE TYPE "MxnLiquidationType" AS ENUM ('GTQ', 'USDT');

-- CreateEnum
CREATE TYPE "FiatCurrency" AS ENUM ('GTQ', 'MXN', 'USD', 'USDT');

-- CreateEnum
CREATE TYPE "DistributionDestination" AS ENUM ('OPERATOR', 'EVEREX_BANK', 'CASH');

-- CreateEnum
CREATE TYPE "StmtEntityKind" AS ENUM ('OPERATOR', 'CLIENT', 'PROVIDER_MX');

-- CreateEnum
CREATE TYPE "StmtEntryKind" AS ENUM ('USDT_PURCHASE', 'OTC_ALLOCATION', 'MANUAL_ADJUST', 'PAGO_CLIENTE', 'PAGO_OPERADOR_USDT', 'OPERATOR_MXN_USDT_PAYOUT', 'PAGO_EVEREX_A_OPERADOR');

-- CreateEnum
CREATE TYPE "BankMovementType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "BankRowStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'POSSIBLE_MATCH', 'DIFFERENCE');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('PLANILLA', 'PERSONALES', 'IMPUESTOS', 'ALQUILER', 'PROVEEDORES', 'BANCOS', 'OTROS');

-- CreateEnum
CREATE TYPE "FundsChannel" AS ENUM ('BANK', 'CASH');

-- CreateEnum
CREATE TYPE "StatementLineStatus" AS ENUM ('UNMATCHED', 'POSSIBLE_MATCH', 'MATCHED', 'DIFFERENCE');

-- CreateEnum
CREATE TYPE "EverexCreditorType" AS ENUM ('CLIENT', 'OPERATOR', 'PROVIDER', 'OTHER', 'INVESTOR');

-- CreateEnum
CREATE TYPE "CuadradoraAdjustmentKind" AS ENUM ('BANCO', 'WALLET_USDT', 'UTILIDAD', 'OPERADOR', 'CLIENTE_PENDIENTE');

-- CreateEnum
CREATE TYPE "CuadradoraAdjustmentDirection" AS ENUM ('AUMENTAR', 'DISMINUIR');

-- CreateEnum
CREATE TYPE "CuadradoraAdjustmentStatus" AS ENUM ('ACTIVE', 'REVERSED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "displayName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppAuditLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payloadBefore" JSONB,
    "payloadAfter" JSONB,
    "reason" TEXT,

    CONSTRAINT "AppAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MexicoProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MexicoProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "currency" "FiatCurrency" NOT NULL DEFAULT 'GTQ',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reportedBalance" DECIMAL(65,30),
    "reportedBalanceAt" TIMESTAMP(3),

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsdtPurchase" (
    "id" TEXT NOT NULL,
    "counterparty" "PurchaseCounterparty" NOT NULL,
    "operatorId" TEXT,
    "clientId" TEXT,
    "providerId" TEXT,
    "amountMxn" DECIMAL(65,30),
    "gtqTotal" DECIMAL(65,30) NOT NULL,
    "usdtAmount" DECIMAL(65,30) NOT NULL,
    "rateXe" DECIMAL(65,30),
    "rateMxnToGtq" DECIMAL(65,30),
    "notes" TEXT,
    "dayKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "UsdtPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsdtPurchaseEditLog" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,

    CONSTRAINT "UsdtPurchaseEditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankOpeningBalance" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "BankOpeningBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankOpeningBalanceAudit" (
    "id" TEXT NOT NULL,
    "openingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,

    CONSTRAINT "BankOpeningBalanceAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtcOperation" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "side" "OtcSide" NOT NULL,
    "usdtAmount" DECIMAL(65,30) NOT NULL,
    "rateFiatPerUsdt" DECIMAL(65,30) NOT NULL,
    "totalFiat" DECIMAL(65,30) NOT NULL,
    "fiatCurrency" "FiatCurrency" NOT NULL,
    "pnlBasisGtq" DECIMAL(65,30) NOT NULL,
    "profitGtq" DECIMAL(65,30),
    "profitUsd" DECIMAL(65,30),
    "profitUsdt" DECIMAL(65,30),
    "mxnLiquidation" "MxnLiquidationType",
    "usdtPipelineReceived" DECIMAL(65,30),
    "gtqPaidToClient" DECIMAL(65,30),
    "notes" TEXT,
    "dayKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "OtcOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtcMxnSpread" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "mxnReceived" DECIMAL(65,30) NOT NULL,
    "xeProvider" DECIMAL(65,30) NOT NULL,
    "clientRate" DECIMAL(65,30) NOT NULL,
    "usdtFromProvider" DECIMAL(65,30) NOT NULL,
    "usdtToClient" DECIMAL(65,30) NOT NULL,
    "profitUsdt" DECIMAL(65,30) NOT NULL,
    "notes" TEXT,
    "dayKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "OtcMxnSpread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorMxnUsdtSettlement" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "providerId" TEXT,
    "mxnReceived" DECIMAL(65,30) NOT NULL,
    "xeReference" DECIMAL(65,30) NOT NULL,
    "usdtPaid" DECIMAL(65,30) NOT NULL,
    "gtqRateOptional" DECIMAL(65,30),
    "referenceUsdt" DECIMAL(65,30) NOT NULL,
    "diffUsdt" DECIMAL(65,30) NOT NULL,
    "notes" TEXT,
    "dayKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "OperatorMxnUsdtSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtcAllocation" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "destination" "DistributionDestination" NOT NULL,
    "operatorId" TEXT,
    "bankAccountId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" "FiatCurrency" NOT NULL DEFAULT 'GTQ',
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtcAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementEntry" (
    "id" TEXT NOT NULL,
    "entityKind" "StmtEntityKind" NOT NULL,
    "operatorId" TEXT,
    "clientId" TEXT,
    "providerId" TEXT,
    "amountGtq" DECIMAL(65,30) NOT NULL,
    "kind" "StmtEntryKind" NOT NULL,
    "label" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "dayKey" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "StatementEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankMovement" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "type" "BankMovementType" NOT NULL,
    "currency" "FiatCurrency" NOT NULL DEFAULT 'GTQ',
    "reference" TEXT,
    "status" "BankRowStatus" NOT NULL DEFAULT 'UNMATCHED',
    "matchedNote" TEXT,
    "sourceOtcId" TEXT,
    "sourceOtcAllocationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "BankMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" "FiatCurrency" NOT NULL,
    "channel" "FundsChannel" NOT NULL,
    "bankAccountId" TEXT,
    "description" TEXT NOT NULL,
    "proofImage" TEXT,
    "dayKey" TEXT NOT NULL,
    "bankMovementId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientReceivable" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "originalAmount" DECIMAL(65,30) NOT NULL,
    "balance" DECIMAL(65,30) NOT NULL,
    "currency" "FiatCurrency" NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dayKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "ClientReceivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientReceivablePayment" (
    "id" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" "FiatCurrency" NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "channel" "FundsChannel" NOT NULL,
    "bankAccountId" TEXT,
    "reference" TEXT,
    "proofImage" TEXT,
    "dayKey" TEXT NOT NULL,
    "bankMovementId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientReceivablePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EverexPayable" (
    "id" TEXT NOT NULL,
    "creditorName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "creditorType" "EverexCreditorType" NOT NULL,
    "clientId" TEXT,
    "operatorId" TEXT,
    "providerId" TEXT,
    "otherName" TEXT,
    "originalAmount" DECIMAL(65,30) NOT NULL,
    "balance" DECIMAL(65,30) NOT NULL,
    "currency" "FiatCurrency" NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dayKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "EverexPayable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EverexPayablePayment" (
    "id" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" "FiatCurrency" NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "channel" "FundsChannel" NOT NULL,
    "bankAccountId" TEXT,
    "reference" TEXT,
    "proofImage" TEXT,
    "dayKey" TEXT NOT NULL,
    "bankMovementId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EverexPayablePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankImportBatch" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "BankImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementLine" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "batchId" TEXT,
    "rowDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "credit" DECIMAL(65,30),
    "debit" DECIMAL(65,30),
    "balanceAfter" DECIMAL(65,30),
    "status" "StatementLineStatus" NOT NULL DEFAULT 'UNMATCHED',
    "suggestedMovementId" TEXT,
    "matchedBankMovementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuadradoraAdjustment" (
    "id" TEXT NOT NULL,
    "kind" "CuadradoraAdjustmentKind" NOT NULL,
    "direction" "CuadradoraAdjustmentDirection" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" "FiatCurrency" NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "dayKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "status" "CuadradoraAdjustmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "operatorId" TEXT,
    "receivableId" TEXT,
    "reversesId" TEXT,
    "reversedById" TEXT,
    "bankMovementId" TEXT,
    "statementEntryId" TEXT,
    "walletUsdtSigned" DECIMAL(65,30),

    CONSTRAINT "CuadradoraAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AppAuditLog_entityType_entityId_createdAt_idx" ON "AppAuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AppAuditLog_userId_createdAt_idx" ON "AppAuditLog"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Operator_name_key" ON "Operator"("name");

-- CreateIndex
CREATE INDEX "UsdtPurchase_dayKey_idx" ON "UsdtPurchase"("dayKey");

-- CreateIndex
CREATE INDEX "UsdtPurchase_counterparty_idx" ON "UsdtPurchase"("counterparty");

-- CreateIndex
CREATE INDEX "UsdtPurchase_providerId_idx" ON "UsdtPurchase"("providerId");

-- CreateIndex
CREATE INDEX "UsdtPurchaseEditLog_purchaseId_createdAt_idx" ON "UsdtPurchaseEditLog"("purchaseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankOpeningBalance_bankAccountId_key" ON "BankOpeningBalance"("bankAccountId");

-- CreateIndex
CREATE INDEX "BankOpeningBalance_effectiveAt_idx" ON "BankOpeningBalance"("effectiveAt");

-- CreateIndex
CREATE INDEX "BankOpeningBalanceAudit_openingId_idx" ON "BankOpeningBalanceAudit"("openingId");

-- CreateIndex
CREATE UNIQUE INDEX "OtcOperation_ref_key" ON "OtcOperation"("ref");

-- CreateIndex
CREATE INDEX "OtcOperation_clientId_idx" ON "OtcOperation"("clientId");

-- CreateIndex
CREATE INDEX "OtcOperation_dayKey_idx" ON "OtcOperation"("dayKey");

-- CreateIndex
CREATE INDEX "OtcOperation_side_idx" ON "OtcOperation"("side");

-- CreateIndex
CREATE UNIQUE INDEX "OtcMxnSpread_ref_key" ON "OtcMxnSpread"("ref");

-- CreateIndex
CREATE INDEX "OtcMxnSpread_clientId_idx" ON "OtcMxnSpread"("clientId");

-- CreateIndex
CREATE INDEX "OtcMxnSpread_providerId_idx" ON "OtcMxnSpread"("providerId");

-- CreateIndex
CREATE INDEX "OtcMxnSpread_dayKey_idx" ON "OtcMxnSpread"("dayKey");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorMxnUsdtSettlement_ref_key" ON "OperatorMxnUsdtSettlement"("ref");

-- CreateIndex
CREATE INDEX "OperatorMxnUsdtSettlement_operatorId_dayKey_idx" ON "OperatorMxnUsdtSettlement"("operatorId", "dayKey");

-- CreateIndex
CREATE INDEX "OperatorMxnUsdtSettlement_dayKey_idx" ON "OperatorMxnUsdtSettlement"("dayKey");

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
CREATE INDEX "StatementEntry_refType_refId_idx" ON "StatementEntry"("refType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "BankMovement_sourceOtcAllocationId_key" ON "BankMovement"("sourceOtcAllocationId");

-- CreateIndex
CREATE INDEX "BankMovement_bankAccountId_date_idx" ON "BankMovement"("bankAccountId", "date");

-- CreateIndex
CREATE INDEX "BankMovement_status_idx" ON "BankMovement"("status");

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
CREATE INDEX "EverexPayable_clientId_idx" ON "EverexPayable"("clientId");

-- CreateIndex
CREATE INDEX "EverexPayable_providerId_idx" ON "EverexPayable"("providerId");

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

-- CreateIndex
CREATE UNIQUE INDEX "CuadradoraAdjustment_reversedById_key" ON "CuadradoraAdjustment"("reversedById");

-- CreateIndex
CREATE UNIQUE INDEX "CuadradoraAdjustment_bankMovementId_key" ON "CuadradoraAdjustment"("bankMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "CuadradoraAdjustment_statementEntryId_key" ON "CuadradoraAdjustment"("statementEntryId");

-- CreateIndex
CREATE INDEX "CuadradoraAdjustment_dayKey_idx" ON "CuadradoraAdjustment"("dayKey");

-- CreateIndex
CREATE INDEX "CuadradoraAdjustment_kind_status_idx" ON "CuadradoraAdjustment"("kind", "status");

-- CreateIndex
CREATE INDEX "CuadradoraAdjustment_createdAt_idx" ON "CuadradoraAdjustment"("createdAt");

-- AddForeignKey
ALTER TABLE "AppAuditLog" ADD CONSTRAINT "AppAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsdtPurchase" ADD CONSTRAINT "UsdtPurchase_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsdtPurchase" ADD CONSTRAINT "UsdtPurchase_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsdtPurchase" ADD CONSTRAINT "UsdtPurchase_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MexicoProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsdtPurchase" ADD CONSTRAINT "UsdtPurchase_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsdtPurchaseEditLog" ADD CONSTRAINT "UsdtPurchaseEditLog_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "UsdtPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsdtPurchaseEditLog" ADD CONSTRAINT "UsdtPurchaseEditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankOpeningBalance" ADD CONSTRAINT "BankOpeningBalance_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankOpeningBalance" ADD CONSTRAINT "BankOpeningBalance_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankOpeningBalance" ADD CONSTRAINT "BankOpeningBalance_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankOpeningBalanceAudit" ADD CONSTRAINT "BankOpeningBalanceAudit_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "BankOpeningBalance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankOpeningBalanceAudit" ADD CONSTRAINT "BankOpeningBalanceAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtcOperation" ADD CONSTRAINT "OtcOperation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtcOperation" ADD CONSTRAINT "OtcOperation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtcMxnSpread" ADD CONSTRAINT "OtcMxnSpread_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtcMxnSpread" ADD CONSTRAINT "OtcMxnSpread_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MexicoProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtcMxnSpread" ADD CONSTRAINT "OtcMxnSpread_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorMxnUsdtSettlement" ADD CONSTRAINT "OperatorMxnUsdtSettlement_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorMxnUsdtSettlement" ADD CONSTRAINT "OperatorMxnUsdtSettlement_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MexicoProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorMxnUsdtSettlement" ADD CONSTRAINT "OperatorMxnUsdtSettlement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtcAllocation" ADD CONSTRAINT "OtcAllocation_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "OtcOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtcAllocation" ADD CONSTRAINT "OtcAllocation_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtcAllocation" ADD CONSTRAINT "OtcAllocation_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementEntry" ADD CONSTRAINT "StatementEntry_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementEntry" ADD CONSTRAINT "StatementEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementEntry" ADD CONSTRAINT "StatementEntry_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MexicoProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementEntry" ADD CONSTRAINT "StatementEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMovement" ADD CONSTRAINT "BankMovement_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMovement" ADD CONSTRAINT "BankMovement_sourceOtcAllocationId_fkey" FOREIGN KEY ("sourceOtcAllocationId") REFERENCES "OtcAllocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMovement" ADD CONSTRAINT "BankMovement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_bankMovementId_fkey" FOREIGN KEY ("bankMovementId") REFERENCES "BankMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientReceivable" ADD CONSTRAINT "ClientReceivable_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientReceivable" ADD CONSTRAINT "ClientReceivable_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientReceivablePayment" ADD CONSTRAINT "ClientReceivablePayment_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "ClientReceivable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientReceivablePayment" ADD CONSTRAINT "ClientReceivablePayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientReceivablePayment" ADD CONSTRAINT "ClientReceivablePayment_bankMovementId_fkey" FOREIGN KEY ("bankMovementId") REFERENCES "BankMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientReceivablePayment" ADD CONSTRAINT "ClientReceivablePayment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EverexPayable" ADD CONSTRAINT "EverexPayable_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EverexPayable" ADD CONSTRAINT "EverexPayable_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EverexPayable" ADD CONSTRAINT "EverexPayable_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MexicoProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EverexPayable" ADD CONSTRAINT "EverexPayable_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EverexPayablePayment" ADD CONSTRAINT "EverexPayablePayment_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "EverexPayable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EverexPayablePayment" ADD CONSTRAINT "EverexPayablePayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EverexPayablePayment" ADD CONSTRAINT "EverexPayablePayment_bankMovementId_fkey" FOREIGN KEY ("bankMovementId") REFERENCES "BankMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EverexPayablePayment" ADD CONSTRAINT "EverexPayablePayment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankImportBatch" ADD CONSTRAINT "BankImportBatch_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankImportBatch" ADD CONSTRAINT "BankImportBatch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BankImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_matchedBankMovementId_fkey" FOREIGN KEY ("matchedBankMovementId") REFERENCES "BankMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuadradoraAdjustment" ADD CONSTRAINT "CuadradoraAdjustment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuadradoraAdjustment" ADD CONSTRAINT "CuadradoraAdjustment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuadradoraAdjustment" ADD CONSTRAINT "CuadradoraAdjustment_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuadradoraAdjustment" ADD CONSTRAINT "CuadradoraAdjustment_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "ClientReceivable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuadradoraAdjustment" ADD CONSTRAINT "CuadradoraAdjustment_bankMovementId_fkey" FOREIGN KEY ("bankMovementId") REFERENCES "BankMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuadradoraAdjustment" ADD CONSTRAINT "CuadradoraAdjustment_statementEntryId_fkey" FOREIGN KEY ("statementEntryId") REFERENCES "StatementEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

