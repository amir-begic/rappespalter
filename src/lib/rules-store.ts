import { prisma } from "@/lib/prisma"
import { findRule } from "@/lib/rules"

// The desktop app doesn't migrate existing userData databases, so create the
// table on demand (mirrors 20261102030400_rules_targets_fees/migration.sql).
let tableReady: Promise<unknown> | null = null
export function ensureRuleTable() {
  tableReady ??= prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "CategoryRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pattern" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'contains',
    "direction" TEXT NOT NULL DEFAULT 'any',
    "categoryId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CategoryRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`).catch(err => { tableReady = null; throw err })
  return tableReady
}

// After the database file is swapped (restore), check again on next use.
export function resetRuleTable() {
  tableReady = null
}

// For each transaction, which rule decides it and whether that changes its
// category. `onlyRuleId` restricts the result to one rule's transactions.
export async function planRuleChanges(onlyRuleId?: number) {
  await ensureRuleTable()
  const [rules, transactions] = await Promise.all([
    prisma.categoryRule.findMany(),
    prisma.transaction.findMany({ select: { id: true, counterparty: true, amount: true, categoryId: true } }),
  ])
  const byRule = new Map<number, { matches: number; changes: number[] }>(rules.map(r => [r.id, { matches: 0, changes: [] }]))
  for (const tx of transactions) {
    const rule = findRule(rules, tx)
    if (!rule || (onlyRuleId != null && rule.id !== onlyRuleId)) continue
    const entry = byRule.get(rule.id)!
    entry.matches++
    if (tx.categoryId !== rule.categoryId) entry.changes.push(tx.id)
  }
  return { rules, byRule }
}
