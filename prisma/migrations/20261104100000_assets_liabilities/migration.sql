-- CreateTable
CREATE TABLE "Asset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "subtype" TEXT,
    "valuation" TEXT NOT NULL DEFAULT 'manual',
    "quantity" REAL,
    "unit" TEXT,
    "purchaseDate" TEXT,
    "purchasePrice" REAL,
    "depreciationRate" REAL,
    "residualValue" REAL,
    "soldDate" TEXT,
    "soldPrice" REAL,
    "costCategories" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AssetValue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "assetId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "value" REAL NOT NULL,
    CONSTRAINT "AssetValue_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Liability" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'loan',
    "assetId" INTEGER,
    "principal" REAL NOT NULL DEFAULT 0,
    "rate" REAL NOT NULL DEFAULT 0,
    "startDate" TEXT NOT NULL,
    "termMonths" INTEGER,
    "monthlyPayment" REAL,
    "balloon" REAL NOT NULL DEFAULT 0,
    "balance" REAL,
    "balanceDate" TEXT,
    "counterparty" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Liability_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AssetValue_assetId_idx" ON "AssetValue"("assetId");

-- CreateIndex
CREATE INDEX "Liability_assetId_idx" ON "Liability"("assetId");
