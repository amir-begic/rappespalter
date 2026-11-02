-- CreateTable
CREATE TABLE "FundSource" (
    "symbol" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "asOf" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fundName" TEXT,
    "sourceUrl" TEXT,
    "lastError" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FundConstituent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "ticker" TEXT,
    "isin" TEXT,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "sector" TEXT,
    "assetClass" TEXT NOT NULL,
    "weight" REAL NOT NULL
);

-- CreateIndex
CREATE INDEX "FundConstituent_symbol_idx" ON "FundConstituent"("symbol");
