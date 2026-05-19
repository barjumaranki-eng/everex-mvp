-- CreateTable
CREATE TABLE "OtcMxnSpread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ref" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "mxnReceived" DECIMAL NOT NULL,
    "xeProvider" DECIMAL NOT NULL,
    "clientRate" DECIMAL NOT NULL,
    "usdtFromProvider" DECIMAL NOT NULL,
    "usdtToClient" DECIMAL NOT NULL,
    "profitUsdt" DECIMAL NOT NULL,
    "notes" TEXT,
    "dayKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    CONSTRAINT "OtcMxnSpread_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OtcMxnSpread_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MexicoProvider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OtcMxnSpread_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OtcMxnSpread_ref_key" ON "OtcMxnSpread"("ref");

-- CreateIndex
CREATE INDEX "OtcMxnSpread_clientId_idx" ON "OtcMxnSpread"("clientId");

-- CreateIndex
CREATE INDEX "OtcMxnSpread_providerId_idx" ON "OtcMxnSpread"("providerId");

-- CreateIndex
CREATE INDEX "OtcMxnSpread_dayKey_idx" ON "OtcMxnSpread"("dayKey");
