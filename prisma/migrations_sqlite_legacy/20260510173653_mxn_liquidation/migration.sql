-- AlterTable
ALTER TABLE "OtcOperation" ADD COLUMN "gtqPaidToClient" DECIMAL;
ALTER TABLE "OtcOperation" ADD COLUMN "mxnLiquidation" TEXT;
ALTER TABLE "OtcOperation" ADD COLUMN "profitUsdt" DECIMAL;
ALTER TABLE "OtcOperation" ADD COLUMN "usdtPipelineReceived" DECIMAL;
