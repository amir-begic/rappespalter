// How the review inbox groups rows: one group per payee, money in and out apart, the
// groups that clear the most rows first. Pure; used by Data → Review, the setup's
// "sort your top payees" step and the nav badge.
import { cleanCamtPayee, payeeKey } from "./counterparty"

interface ReviewRow {
  counterparty: string
  amount:       number
  date:         string
  categoryId:   number | null
  category:     unknown
  mark:         { categorySource: string | null } | null
}

export interface PayeeGroup<T extends ReviewRow> {
  key:          string
  counterparty: string
  items:        T[]
  total:        number
  latest:       string
  guessed:      T["category"] | null // the category it has for now: the parser's fallback, or a suggestion
  source:       string | null        // how that was chosen
}

const groupKey = (tx: { counterparty: string; amount: number }) => `${tx.amount > 0 ? "in" : "out"}:${payeeKey(tx.counterparty)}`

// The weakest guess speaks for the group.
const strength = (source: string | null) => source === "suggested-list" || source === "suggested-rhythm" ? 0 : source === "suggested-brand" ? 1 : 2

export function groupByPayee<T extends ReviewRow>(transactions: T[]): PayeeGroup<T>[] {
  const map = new Map<string, PayeeGroup<T>>()
  for (const t of transactions) {
    const key = groupKey(t)
    const g = map.get(key) ?? {
      key, counterparty: cleanCamtPayee(t.counterparty).name, items: [], total: 0, latest: t.date, guessed: null, source: null,
    }
    g.items.push(t)
    g.total += t.amount
    if (t.date > g.latest) g.latest = t.date
    if (t.categoryId != null && t.category) {
      g.guessed = t.category
      const source = t.mark?.categorySource ?? null
      if (g.source == null || strength(source) < strength(g.source)) g.source = source
    }
    map.set(key, g)
  }
  return [...map.values()].sort((a, b) => b.items.length - a.items.length || b.latest.localeCompare(a.latest))
}

// Below this many single payments there's nothing to tuck away.
const MIN_LONG_TAIL = 10

// The groups to show first: a long tail of single payments waits behind "Everything else".
export function splitLongTail<G extends { items: unknown[] }>(groups: G[]): { main: G[]; tail: G[] } {
  const tail = groups.filter(g => g.items.length === 1)
  if (tail.length < MIN_LONG_TAIL || tail.length === groups.length) return { main: groups, tail: [] }
  return { main: groups.filter(g => g.items.length > 1), tail }
}

// How many of the (largest first) groups the setup's Sort step lists: enough to cover
// `share` of the payments, within [min, max] groups, so one pass sorts most of them.
export function groupsToCover(groups: { items: unknown[] }[], share = 0.8, min = 20, max = 60): number {
  const total = groups.reduce((sum, g) => sum + g.items.length, 0)
  let n = 0, covered = 0
  while (n < groups.length && n < max && (n < min || covered < share * total)) covered += groups[n++].items.length
  return n
}

// For the first weeks after the first import, the nav badge leaves out single payments, so
// a new user isn't faced with hundreds of small items.
const SETTLING_IN_DAYS = 30
export function isSettlingIn(firstImport: Date | null, now = new Date()): boolean {
  return firstImport != null && now.getTime() - firstImport.getTime() < SETTLING_IN_DAYS * 86_400_000
}

// How many rows belong to a payee with more than one payment.
export function countRepeating(rows: { counterparty: string; amount: number }[]): number {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = groupKey(row)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.values()].reduce((sum, n) => sum + (n > 1 ? n : 0), 0)
}
