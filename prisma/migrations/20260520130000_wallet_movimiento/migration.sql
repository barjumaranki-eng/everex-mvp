-- CreateEnum
CREATE TYPE "WalletMovimientoTipo" AS ENUM ('ENTRADA', 'SALIDA');

-- CreateEnum
CREATE TYPE "WalletMovimientoOrigen" AS ENUM ('COMPRA_PROVEEDOR', 'CLIENTE_VENDE', 'VENTA_CLIENTE', 'PAGO_OPERADOR');

-- CreateTable
CREATE TABLE "WalletMovimiento" (
    "id" TEXT NOT NULL,
    "tipo" "WalletMovimientoTipo" NOT NULL,
    "origen" "WalletMovimientoOrigen" NOT NULL,
    "usdtMonto" DECIMAL(65,30) NOT NULL,
    "referenciaId" TEXT NOT NULL,
    "etiqueta" TEXT,
    "dayKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletMovimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WalletMovimiento_referenciaId_idx" ON "WalletMovimiento"("referenciaId");

-- CreateIndex
CREATE INDEX "WalletMovimiento_dayKey_idx" ON "WalletMovimiento"("dayKey");

-- CreateIndex
CREATE INDEX "WalletMovimiento_createdAt_idx" ON "WalletMovimiento"("createdAt");

-- CreateIndex
CREATE INDEX "WalletMovimiento_origen_idx" ON "WalletMovimiento"("origen");
