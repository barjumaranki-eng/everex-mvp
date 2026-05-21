-- ClientBalance + ejecución real en OtcOperation
CREATE TABLE "ClientBalance" (
    "clientId" TEXT NOT NULL,
    "saldoGTQ" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "saldoUSDT" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientBalance_pkey" PRIMARY KEY ("clientId")
);

ALTER TABLE "ClientBalance" ADD CONSTRAINT "ClientBalance_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OtcOperation" ADD COLUMN "fiatRecibidoReal" DECIMAL(65,30),
ADD COLUMN "usdtEntregadoReal" DECIMAL(65,30);
