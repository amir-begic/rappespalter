// Spending pace — where the month in progress is heading, per budgeted category.
// Pure, like budget-drift.ts. A straight "spent ÷ days × days in month" would
// project rent paid on the 1st to 30× its size, so:
//   fixed    → max(spent so far, usual monthly amount)
//   variable → spent so far + usual amount × share of the month still to come
// "Usual" is the mean of the last few complete months (HISTORY_MONTHS); without
// history, variable spending is extrapolated linearly and fixed stays as spent.

import { driftWindow, type DriftCategory } from "./budget-drift"

export const HISTORY_MONTHS = 3

export interface PaceEntry {
  date:       string        // YYYY-MM-DD, local (Swiss) time
  categoryId: number | null
  amount:     number        // > 0, money spent
}

export interface PaceRow {
  categoryId: number
  name:       string
  color:      string
  type:       string
  budget:     number
  spent:      number
  usual:      number | null // mean of the history months, null without history
  projected:  number
  over:       number        // projected − budget
}

export interface PaceResult {
  month:       string
  inProgress:  boolean // false for a complete month: nothing to project
  asOf:        string  // the day the projection is based on
  day:         number
  daysInMonth: number
  history:     string[] // months the "usual" amounts come from
  rows:        PaceRow[] // most over first
  totals:      { budget: number; spent: number; projected: number; over: number }
  // Every category the dashboard counts as spending, budgeted or not.
  allSpending: { spent: number; projected: number }
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function analysePace(
  entries: PaceEntry[], categories: DriftCategory[], opts: { month: string; asOf: string },
): PaceResult {
  const { month, asOf } = opts
  const [y, m] = month.split("-").map(Number)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const inProgress = asOf.slice(0, 7) === month
  const day = inProgress ? Number(asOf.slice(8, 10)) : daysInMonth
  const remaining = (daysInMonth - day) / daysInMonth

  const dataMonths = [...new Set(entries.map(e => e.date.slice(0, 7)))]
  const history = driftWindow(dataMonths.filter(d => d < month), `${month}-01`, HISTORY_MONTHS)
  const inHistory = new Set(history)

  const spentBy = new Map<number | null, number>()
  const historyBy = new Map<number | null, number>()
  for (const e of entries) {
    const em = e.date.slice(0, 7)
    if (em === month && e.date <= asOf) spentBy.set(e.categoryId, (spentBy.get(e.categoryId) ?? 0) + e.amount)
    else if (inHistory.has(em)) historyBy.set(e.categoryId, (historyBy.get(e.categoryId) ?? 0) + e.amount)
  }

  const byId = new Map(categories.map(c => [c.id, c]))
  const project = (id: number | null) => {
    const spent = spentBy.get(id) ?? 0
    const usual = history.length ? (historyBy.get(id) ?? 0) / history.length : null
    if (!inProgress) return { spent, usual, projected: spent }
    const fixed = id != null && byId.get(id)?.type === "fixed"
    const projected = fixed
      ? Math.max(spent, usual ?? 0)
      : usual != null ? spent + usual * remaining : (day > 0 ? spent / day * daysInMonth : spent)
    return { spent, usual, projected }
  }

  const rows: PaceRow[] = categories.filter(c => c.budget != null).map(c => {
    const p = project(c.id)
    return {
      categoryId: c.id, name: c.name, color: c.color, type: c.type, budget: c.budget!,
      spent: round2(p.spent), usual: p.usual == null ? null : round2(p.usual),
      projected: round2(p.projected), over: round2(p.projected - c.budget!),
    }
  }).sort((a, b) => b.over - a.over || a.name.localeCompare(b.name))

  const sum = (f: (r: PaceRow) => number) => round2(rows.reduce((s, r) => s + f(r), 0))
  const everyone = new Set<number | null>([...spentBy.keys(), ...historyBy.keys()])
  let allSpent = 0, allProjected = 0
  for (const id of everyone) { const p = project(id); allSpent += p.spent; allProjected += p.projected }

  return {
    month, inProgress, asOf, day, daysInMonth, history, rows,
    totals: { budget: sum(r => r.budget), spent: sum(r => r.spent), projected: sum(r => r.projected), over: sum(r => r.over) },
    allSpending: { spent: round2(allSpent), projected: round2(allProjected) },
  }
}
