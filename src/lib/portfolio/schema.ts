import { prisma } from "@/lib/prisma"

// The desktop app doesn't run migrations on an existing userData database, so
// create the portfolio tables on demand. Keep in sync with
// prisma/migrations/20260924134837_add_portfolio/migration.sql and
// prisma/migrations/20261102001113_add_fund_constituents/migration.sql and the
// columns added by 20261102030400_rules_targets_fees (see COLUMNS).
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "PortfolioActivity" (
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
  )`,
  `CREATE TABLE IF NOT EXISTS "Security" (
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
  )`,
  `CREATE TABLE IF NOT EXISTS "SecurityPrice" (
    "symbol" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "close" REAL NOT NULL,
    "source" TEXT NOT NULL,
    PRIMARY KEY ("symbol", "date")
  )`,
  `CREATE TABLE IF NOT EXISTS "FxRate" (
    "currency" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "rate" REAL NOT NULL,
    PRIMARY KEY ("currency", "date")
  )`,
  `CREATE TABLE IF NOT EXISTS "FundSource" (
    "symbol" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "asOf" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fundName" TEXT,
    "sourceUrl" TEXT,
    "lastError" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "FundConstituent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "ticker" TEXT,
    "isin" TEXT,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "sector" TEXT,
    "assetClass" TEXT NOT NULL,
    "weight" REAL NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "FundConstituent_symbol_idx" ON "FundConstituent"("symbol")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PortfolioActivity_sourceHash_key" ON "PortfolioActivity"("sourceHash")`,
  `CREATE INDEX IF NOT EXISTS "PortfolioActivity_date_idx" ON "PortfolioActivity"("date")`,
]

// Columns added to existing tables after they first shipped. CREATE TABLE IF
// NOT EXISTS leaves an older table as it is, so add any that are missing.
const COLUMNS: [table: string, column: string, type: string][] = [
  ["Security", "ter", "REAL"],
  ["Security", "targetWeight", "REAL"],
  ["FundConstituent", "currency", "TEXT"],
]

export async function addMissingColumns(columns: [string, string, string][]) {
  for (const table of new Set(columns.map(c => c[0]))) {
    const existing = new Set((await prisma.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("${table}")`)).map(c => c.name))
    for (const [, column, type] of columns.filter(c => c[0] === table && !existing.has(c[1]))) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${type}`)
    }
  }
}

let ready: Promise<void> | null = null

export function ensurePortfolioSchema(): Promise<void> {
  ready ??= (async () => {
    for (const sql of STATEMENTS) await prisma.$executeRawUnsafe(sql)
    await addMissingColumns(COLUMNS)
  })().catch(err => { ready = null; throw err })
  return ready
}

// After the database file is swapped (restore), check again on next use.
export function resetPortfolioSchema() {
  ready = null
}
