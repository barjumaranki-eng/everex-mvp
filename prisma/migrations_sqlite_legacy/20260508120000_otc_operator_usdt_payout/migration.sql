-- Redefine enums (SQLite): Prisma stores enums as TEXT on new values via migrate
-- OtcOperatorPayoutCurrency + StatementEntry.amountUsdt + OtcAllocation columns + StmtEntryKind value

-- CreateTable pattern for SQLite: ALTER ADD COLUMN
ALTER TABLE "OtcAllocation" ADD COLUMN "operatorPayoutCurrency" TEXT NOT NULL DEFAULT 'GTQ';
ALTER TABLE "OtcAllocation" ADD COLUMN "notes" TEXT;

ALTER TABLE "StatementEntry" ADD COLUMN "amountUsdt" REAL;
