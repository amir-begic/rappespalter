import { prisma } from "@/lib/prisma"
import { findRule } from "@/lib/rules"

// For each transaction, which rule decides it and whether that changes its
// category. `onlyRuleId` restricts the result to one rule's transactions.
export async function planRuleChanges(onlyRuleId?: number) {
  const [rules, transactions, transfers] = await Promise.all([
    prisma.categoryRule.findMany(),
    prisma.transaction.findMany({ select: { id: true, counterparty: true, amount: true, categoryId: true } }),
    prisma.category.findMany({ where: { type: "transfer" }, select: { id: true } }),
  ])
  const transferIds = new Set(transfers.map(c => c.id))
  const byRule = new Map<number, { matches: number; changes: number[] }>(rules.map(r => [r.id, { matches: 0, changes: [] }]))
  for (const tx of transactions) {
    const rule = findRule(rules, tx)
    if (!rule || (onlyRuleId != null && rule.id !== onlyRuleId)) continue
    const entry = byRule.get(rule.id)!
    entry.matches++
    // Money moved between own accounts stays a transfer: a rule on a payee such
    // as "Zeichnung Vorsorge" must not pull those rows into a spending/savings category.
    const keepsTransfer = tx.categoryId != null && transferIds.has(tx.categoryId) && !transferIds.has(rule.categoryId)
    if (tx.categoryId !== rule.categoryId && !keepsTransfer) entry.changes.push(tx.id)
  }
  return { rules, byRule }
}
