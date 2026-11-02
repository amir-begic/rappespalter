// Auto-categorization rules: "counterparty contains Migros → Groceries".
// Applied on import (before the parser's own category mapping) and, on request,
// to transactions already in the database. When several rules match, the
// longest pattern wins, so a specific rule ("Coop Pronto") beats a general one
// ("Coop") without any manual ordering. Pure — database access is in rules-store.ts.

export const MATCH_TYPES = [
  { value: "contains",   label: "contains" },
  { value: "startsWith", label: "starts with" },
  { value: "equals",     label: "is exactly" },
] as const
export const DIRECTIONS = [
  { value: "any", label: "in or out" },
  { value: "out", label: "money out" },
  { value: "in",  label: "money in" },
] as const

export type MatchType = (typeof MATCH_TYPES)[number]["value"]
export type Direction = (typeof DIRECTIONS)[number]["value"]

export const isMatchType = (v: unknown): v is MatchType => MATCH_TYPES.some(m => m.value === v)
export const isDirection = (v: unknown): v is Direction => DIRECTIONS.some(d => d.value === v)

export interface Rule {
  id:         number
  pattern:    string
  matchType:  string
  direction:  string
  categoryId: number
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()

export function ruleMatches(rule: Rule, tx: { counterparty: string; amount: number }): boolean {
  if (rule.direction === "in" && tx.amount <= 0) return false
  if (rule.direction === "out" && tx.amount >= 0) return false
  const p = norm(rule.pattern), c = norm(tx.counterparty)
  if (!p) return false
  return rule.matchType === "equals" ? c === p
    : rule.matchType === "startsWith" ? c.startsWith(p)
    : c.includes(p)
}

// The rule that decides a transaction's category, or null if none matches.
export function findRule<R extends Rule>(rules: R[], tx: { counterparty: string; amount: number }): R | null {
  let best: R | null = null
  for (const r of rules) {
    if (!ruleMatches(r, tx)) continue
    // Longest pattern wins; on a tie, an exact match beats a prefix beats
    // "contains", then the older rule.
    const rank = (x: R) => [norm(x.pattern).length, x.matchType === "equals" ? 2 : x.matchType === "startsWith" ? 1 : 0, -x.id]
    if (!best || compare(rank(r), rank(best)) > 0) best = r
  }
  return best
}

const compare = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}
