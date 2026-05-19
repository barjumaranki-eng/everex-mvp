-- Anticipos cliente (venta OTC parcial): columnas opcionales en EverexPayable
ALTER TABLE "EverexPayable" ADD COLUMN "clientId" TEXT;
ALTER TABLE "EverexPayable" ADD COLUMN "sourceOtcOperationId" TEXT;
ALTER TABLE "EverexPayable" ADD COLUMN "isClientUsdtAdvance" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "EverexPayable_sourceOtcOperationId_key" ON "EverexPayable"("sourceOtcOperationId");
CREATE INDEX "EverexPayable_clientId_idx" ON "EverexPayable"("clientId");
