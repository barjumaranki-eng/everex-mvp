-- Fecha operativa vs creación de registro (backfill seguro: null → fechas existentes).

ALTER TABLE "UsdtPurchase" ADD COLUMN "operatedAt" DATETIME;
UPDATE "UsdtPurchase" SET "operatedAt" = "createdAt" WHERE "operatedAt" IS NULL;

ALTER TABLE "OtcOperation" ADD COLUMN "operatedAt" DATETIME;
UPDATE "OtcOperation" SET "operatedAt" = "createdAt" WHERE "operatedAt" IS NULL;

ALTER TABLE "OtcMxnSpread" ADD COLUMN "operatedAt" DATETIME;
UPDATE "OtcMxnSpread" SET "operatedAt" = "createdAt" WHERE "operatedAt" IS NULL;

ALTER TABLE "OperatorMxnUsdtSettlement" ADD COLUMN "operatedAt" DATETIME;
UPDATE "OperatorMxnUsdtSettlement" SET "operatedAt" = "createdAt" WHERE "operatedAt" IS NULL;

ALTER TABLE "OtcAllocation" ADD COLUMN "operatedAt" DATETIME;
UPDATE "OtcAllocation" SET "operatedAt" = "createdAt" WHERE "operatedAt" IS NULL;

ALTER TABLE "StatementEntry" ADD COLUMN "operatedAt" DATETIME;
ALTER TABLE "StatementEntry" ADD COLUMN "createdAt" DATETIME;
UPDATE "StatementEntry" SET "operatedAt" = "postedAt", "createdAt" = "postedAt" WHERE "operatedAt" IS NULL OR "createdAt" IS NULL;

ALTER TABLE "BankMovement" ADD COLUMN "operatedAt" DATETIME;
UPDATE "BankMovement" SET "operatedAt" = "date" WHERE "operatedAt" IS NULL;

ALTER TABLE "Expense" ADD COLUMN "operatedAt" DATETIME;
UPDATE "Expense" SET "operatedAt" = "date" WHERE "operatedAt" IS NULL;

ALTER TABLE "ClientReceivablePayment" ADD COLUMN "operatedAt" DATETIME;
UPDATE "ClientReceivablePayment" SET "operatedAt" = "paymentDate" WHERE "operatedAt" IS NULL;

ALTER TABLE "EverexPayablePayment" ADD COLUMN "operatedAt" DATETIME;
UPDATE "EverexPayablePayment" SET "operatedAt" = "paymentDate" WHERE "operatedAt" IS NULL;
