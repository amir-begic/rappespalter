-- CreateTable
CREATE TABLE "PortfolioActivity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "symbol" TEXT,
    "quantity" REAL,
    "price" REAL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "fee" REAL NOT NULL DEFAULT 0,
    "tax" REAL NOT NULL DEFAULT 0,
    "counterAmount" REAL,
    "counterCurrency" TEXT,
    "description" TEXT NOT NULL,
    "broker" TEXT NOT NULL DEFAULT 'yuh',
    "sourceHash" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Security" (
    "symbol" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "kind" TEXT,
    "priceSource" TEXT NOT NULL DEFAULT 'yahoo',
    "priceSymbol" TEXT,
    "priceCurrency" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "lastError" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SecurityPrice" (
    "symbol" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "close" REAL NOT NULL,
    "source" TEXT NOT NULL,

    PRIMARY KEY ("symbol", "date")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "currency" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "rate" REAL NOT NULL,

    PRIMARY KEY ("currency", "date")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioActivity_sourceHash_key" ON "PortfolioActivity"("sourceHash");

-- CreateIndex
CREATE INDEX "PortfolioActivity_date_idx" ON "PortfolioActivity"("date");
