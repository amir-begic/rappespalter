// Budget drift — how actual spending compares with the monthly budgets over the
// last few complete months. Pure, like income.ts, so it can be checked without a
// database. Spending follows /api/summary: outgoing amounts, excluding savings-
// and transfer-type categories; budgeted + unbudgeted add up to its `expenses`.
//
// Budgets aren't versioned, so every month is compared with today's limit.

import { monthsBetween } from "./income"

export interface SpendEntry {
  month:      string        // YYYY-MM, local (Swiss) time like the rest of the app
  categoryId: number | null // null = uncategorized
  amount:     number        // > 0, money spent
}

export interface DriftCategory {
  id:     number
  name:   string
  color:  string
  type:   string
  budget: number | null // monthly limit
}

export interface DriftRow {
  categoryId: number
  name:       string
  color:      string
  type:       string
  budget:     number
  months:     { month: string; actual: number }[]
  avg:        number        // mean spend per month over the window
  drift:      number        // avg − budget, per month
  driftPct:   number | null // drift ÷ budget (null for a zero budget)
  monthsOver: number
  trend:      number | null // mean of the later half − mean of the earlier half
  suggested:  number        // avg rounded up to the next 10, for "use average"
}

export interface DriftResult {
  months:  string[] // the window, oldest first; empty without data
  current: string   // first month not known to be complete, left out of the window
  // Date of the latest import when that was before the current month: the
  // month it fell in was still in progress, so it isn't counted yet.
  importedThrough: string | null
  rows:    DriftRow[] // most over budget first
  totals: {
    budget:     number
    avg:        number
    drift:      number
    driftPct:   number | null
    monthsOver: number // months where budgeted spending as a whole went over
    months:     { month: string; actual: number; budget: number }[]
  }
  unbudgeted: { avg: number; categories: { name: string; color: string; avg: number }[] }
}

const round2 = (n: number) => Math.round(n * 100) / 100
const mean = (xs: number[]) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number)
  const d = y * 12 + (m - 1) + by
  return `${Math.floor(d / 12)}-${String((d % 12) + 1).padStart(2, "0")}`
}

// The last `count` complete months that have data: ends before the month in
// progress, and at the latest imported month if the data stops earlier (so
// months not imported yet don't look like perfect budget discipline). Pass the
// latest import date as `today` when it's earlier — a month is only complete if
// an import happened after it ended.
export function driftWindow(dataMonths: string[], today: string, count: number): string[] {
  if (!dataMonths.length || count < 1) return []
  const sorted = [...dataMonths].sort()
  const current = today.slice(0, 7)
  const last = sorted.at(-1)!
  const end = last >= current ? shiftMonth(current, -1) : last
  const start = [shiftMonth(end, -(count - 1)), sorted[0]].sort().at(-1)!
  return start > end ? [] : monthsBetween(start, end)
}

export function analyseBudgetDrift(
  entries: SpendEntry[], categories: DriftCategory[],
  opts: { months: number; today: string; lastImport?: string | null },
): DriftResult {
  const stale = opts.lastImport != null && opts.lastImport.slice(0, 7) < opts.today.slice(0, 7)
  const cutoff = stale ? opts.lastImport! : opts.today
  const current = cutoff.slice(0, 7)
  const months = driftWindow([...new Set(entries.map(e => e.month))], cutoff, opts.months)
  const inWindow = new Set(months)

  // Spend per category per month inside the window.
  const spend = new Map<number | null, Map<string, number>>()
  for (const e of entries) {
    if (!inWindow.has(e.month)) continue
    if (!spend.has(e.categoryId)) spend.set(e.categoryId, new Map())
    const byMonth = spend.get(e.categoryId)!
    byMonth.set(e.month, (byMonth.get(e.month) ?? 0) + e.amount)
  }
  const series = (id: number | null) => months.map(m => spend.get(id)?.get(m) ?? 0)

  const budgeted = categories.filter(c => c.budget != null)
  const rows: DriftRow[] = budgeted.map(c => {
    const budget = c.budget!
    const actuals = series(c.id)
    const avg = mean(actuals)
    const half = Math.floor(actuals.length / 2)
    return {
      categoryId: c.id, name: c.name, color: c.color, type: c.type, budget,
      months:     months.map((month, i) => ({ month, actual: round2(actuals[i]) })),
      avg:        round2(avg),
      drift:      round2(avg - budget),
      driftPct:   budget > 0 ? (avg - budget) / budget : null,
      monthsOver: actuals.filter(a => a > budget + 0.005).length,
      trend:      half >= 1 ? round2(mean(actuals.slice(-half)) - mean(actuals.slice(0, half))) : null,
      suggested:  Math.ceil(avg / 10) * 10,
    }
  }).sort((a, b) => b.drift - a.drift || a.name.localeCompare(b.name))

  const budgetTotal = budgeted.reduce((s, c) => s + c.budget!, 0)
  const monthly = months.map((month, i) => ({
    month,
    actual: round2(rows.reduce((s, r) => s + r.months[i].actual, 0)),
    budget: round2(budgetTotal),
  }))
  const avgTotal = mean(monthly.map(m => m.actual))

  // Everything else the dashboard counts as spending: categories without a
  // budget, and uncategorized outgoing payments.
  const byId = new Map(categories.map(c => [c.id, c]))
  const budgetedIds = new Set(budgeted.map(c => c.id))
  const unbudgeted = [...spend.keys()]
    .filter(id => id == null || !budgetedIds.has(id))
    .map(id => {
      const c = id == null ? null : byId.get(id)
      return { name: c?.name ?? "Uncategorized", color: c?.color ?? "#888888", avg: round2(mean(series(id))) }
    })
    .filter(u => u.avg > 0)
    .sort((a, b) => b.avg - a.avg)

  return {
    months,
    current,
    importedThrough: stale ? opts.lastImport! : null,
    rows,
    totals: {
      budget:     round2(budgetTotal),
      avg:        round2(avgTotal),
      drift:      round2(avgTotal - budgetTotal),
      driftPct:   budgetTotal > 0 ? (avgTotal - budgetTotal) / budgetTotal : null,
      monthsOver: monthly.filter(m => m.actual > m.budget + 0.005).length,
      months:     monthly,
    },
    unbudgeted: { avg: round2(unbudgeted.reduce((s, u) => s + u.avg, 0)), categories: unbudgeted },
  }
}
