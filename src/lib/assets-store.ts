import { prisma } from "@/lib/prisma"
import { isAssetKind, isLiabilityKind, type Asset, type Liability } from "@/lib/assets"

// The desktop app doesn't migrate existing userData databases, so create the
// asset tables on demand (mirrors 20261104100000_assets_liabilities/migration.sql).
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "Asset" (
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
  )`,
  `CREATE TABLE IF NOT EXISTS "AssetValue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "assetId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "value" REAL NOT NULL,
    CONSTRAINT "AssetValue_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Liability" (
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
  )`,
  `CREATE INDEX IF NOT EXISTS "AssetValue_assetId_idx" ON "AssetValue"("assetId")`,
  `CREATE INDEX IF NOT EXISTS "Liability_assetId_idx" ON "Liability"("assetId")`,
]

let tablesReady: Promise<unknown> | null = null
export function ensureAssetTables() {
  tablesReady ??= (async () => {
    for (const sql of STATEMENTS) await prisma.$executeRawUnsafe(sql)
  })().catch(err => { tablesReady = null; throw err })
  return tablesReady
}

// After the database file is swapped (restore), check again on next use.
export function resetAssetTables() {
  tablesReady = null
}

export async function loadAssets(): Promise<Asset[]> {
  await ensureAssetTables()
  const rows = await prisma.asset.findMany({
    include: { values: { orderBy: [{ date: "asc" }, { id: "asc" }] } },
    orderBy: { id: "asc" },
  })
  return rows.map(a => ({
    id:               a.id,
    name:             a.name,
    kind:             isAssetKind(a.kind) ? a.kind : "other",
    subtype:          a.subtype,
    valuation:        a.valuation === "depreciation" ? "depreciation" : "manual",
    quantity:         a.quantity,
    unit:             a.unit,
    purchaseDate:     a.purchaseDate,
    purchasePrice:    a.purchasePrice,
    depreciationRate: a.depreciationRate,
    residualValue:    a.residualValue,
    soldDate:         a.soldDate,
    soldPrice:        a.soldPrice,
    costCategories:   parseIds(a.costCategories),
    notes:            a.notes,
    values:           a.values.map(v => ({ id: v.id, date: v.date, value: v.value })),
  }))
}

export async function loadLiabilities(): Promise<Liability[]> {
  await ensureAssetTables()
  const rows = await prisma.liability.findMany({ orderBy: { id: "asc" } })
  return rows.map(l => ({
    id:             l.id,
    name:           l.name,
    kind:           isLiabilityKind(l.kind) ? l.kind : "other",
    assetId:        l.assetId,
    principal:      l.principal,
    rate:           l.rate,
    startDate:      l.startDate,
    termMonths:     l.termMonths,
    monthlyPayment: l.monthlyPayment,
    balloon:        l.balloon,
    balance:        l.balance,
    balanceDate:    l.balanceDate,
    counterparty:   l.counterparty,
    notes:          l.notes,
  }))
}

function parseIds(raw: string | null): number[] {
  if (!raw) return []
  try {
    const ids = JSON.parse(raw)
    return Array.isArray(ids) ? ids.filter(Number.isInteger) : []
  } catch {
    return []
  }
}
