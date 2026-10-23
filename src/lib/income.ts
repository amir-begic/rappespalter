// Per-stream income analysis — pure functions over month-keyed payments so it
// can be checked without a database. A "stream" is an income category (or
// "Uncategorized"); ALL_STREAM aggregates every stream.
//
// Dates are YYYY-MM-DD computed by the caller in local (Swiss) time, the same
// way as the rest of the app, so a payment on the 1st stays in its month.
// Period comparisons (year to date, last 12 months) run to the day, so a month
// in progress is compared against the same days a year earlier.

export const ALL_STREAM = "All income"

export interface IncomeEntry {
  date:   string // YYYY-MM-DD
  stream: string
  color:  string
  type:   string // category type, "income" for uncategorized
  amount: number // > 0
}

export interface MonthPoint {
  month:  string
  amount: number
  count:  number
  avg12:  number // mean of the trailing 12 months (fewer while the stream is younger)
}

export interface YearPoint {
  year:          string
  amount:        number
  count:         number
  partialStart:  boolean // stream started after January — not a full year
  isCurrent:     boolean // year to date
  change:        number | null // vs previous year; for the current year, vs the same days last year
  compareAmount: number | null // what `change` compares against
}

export interface StreamAnalysis {
  name:          string
  color:         string
  type:          string
  total:         number
  count:         number
  firstMonth:    string
  lastMonth:     string // month of the latest payment
  activeMonths:  number // months with at least one payment
  spanMonths:    number // months from the first payment to now
  monthly:       MonthPoint[] // zero-filled, first payment month → now
  yearly:        YearPoint[]
  stats: {
    last12:            number
    prev12:            number
    last12Change:      number | null
    ytd:               number
    ytdPrev:           number // same days of last year
    ytdChange:         number | null
    avgPerActiveMonth: number
    avgPerMonth:       number // over the whole span, including empty months
    avgPayment:        number
    bestMonth:         { month: string; amount: number } | null
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
const change = (now: number, before: number) => before > 0 ? (now - before) / before : null

export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`
}

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let m = from; m <= to; m = nextMonth(m)) out.push(m)
  return out
}

// Same calendar day n years earlier (29 Feb → 28 Feb).
function shiftDate(date: string, years: number): string {
  const y = Number(date.slice(0, 4)) + years
  const md = date.slice(5) === "02-29" ? "02-28" : date.slice(5)
  return `${y}-${md}`
}

function analyse(name: string, color: string, type: string, entries: IncomeEntry[], today: string): StreamAnalysis {
  const asOf = today.slice(0, 7)
  const byMonth = new Map<string, { amount: number; count: number }>()
  for (const e of entries) {
    const month = e.date.slice(0, 7)
    const cur = byMonth.get(month) ?? { amount: 0, count: 0 }
    cur.amount += e.amount
    cur.count++
    byMonth.set(month, cur)
  }
  const months = [...byMonth.keys()].sort()
  const firstMonth = months[0]
  const lastMonth = months[months.length - 1]
  const end = lastMonth > asOf ? lastMonth : asOf

  // Zero-filled monthly series with a trailing 12-month average.
  const monthly: MonthPoint[] = []
  let windowSum = 0
  const span = monthsBetween(firstMonth, end)
  span.forEach((month, i) => {
    const v = byMonth.get(month) ?? { amount: 0, count: 0 }
    windowSum += v.amount
    if (i >= 12) windowSum -= monthly[i - 12].amount
    monthly.push({ month, amount: v.amount, count: v.count, avg12: windowSum / Math.min(12, i + 1) })
  })

  // Sum of payments with from < date <= to (exclusive start), to the day.
  const sumDays = (fromExcl: string, to: string) =>
    entries.filter(e => e.date > fromExcl && e.date <= to).reduce((s, e) => s + e.amount, 0)

  // Last 12 months ending today vs the 12 months before.
  const yearAgo = shiftDate(today, -1)
  const last12 = sumDays(yearAgo, today)
  const prev12 = sumDays(shiftDate(today, -2), yearAgo)

  // Year to date vs the same days last year.
  const year = today.slice(0, 4)
  const ytd = sumDays(`${Number(year) - 1}-12-31`, today)
  const ytdPrev = sumDays(`${Number(year) - 2}-12-31`, yearAgo)

  // Yearly totals.
  const years = [...new Set(span.map(m => m.slice(0, 4)))]
  const yearTotals = new Map(years.map(y => [y, { amount: 0, count: 0 }]))
  for (const p of monthly) {
    const t = yearTotals.get(p.month.slice(0, 4))!
    t.amount += p.amount
    t.count += p.count
  }
  const yearly: YearPoint[] = years.map((y, i) => {
    const t = yearTotals.get(y)!
    const isCurrent = y === year
    const prevYear = i > 0 ? years[i - 1] : null
    const compareAmount = isCurrent ? ytdPrev : prevYear ? yearTotals.get(prevYear)!.amount : null
    return {
      year: y,
      amount: round2(t.amount),
      count: t.count,
      partialStart: i === 0 && !firstMonth.endsWith("-01"),
      isCurrent,
      // A partial first year inflates the next year's growth, so don't compare against it.
      change: compareAmount != null && !(i === 1 && !firstMonth.endsWith("-01")) ? change(t.amount, compareAmount) : null,
      compareAmount: compareAmount != null ? round2(compareAmount) : null,
    }
  })

  const total = entries.reduce((s, e) => s + e.amount, 0)
  const best = monthly.reduce<MonthPoint | null>((b, p) => (!b || p.amount > b.amount ? p : b), null)

  return {
    name, color, type,
    total: round2(total),
    count: entries.length,
    firstMonth,
    lastMonth,
    activeMonths: months.length,
    spanMonths: span.length,
    monthly: monthly.map(p => ({ ...p, amount: round2(p.amount), avg12: round2(p.avg12) })),
    yearly,
    stats: {
      last12:            round2(last12),
      prev12:            round2(prev12),
      last12Change:      change(last12, prev12),
      ytd:               round2(ytd),
      ytdPrev:           round2(ytdPrev),
      ytdChange:         change(ytd, ytdPrev),
      avgPerActiveMonth: round2(total / months.length),
      avgPerMonth:       round2(total / span.length),
      avgPayment:        round2(total / entries.length),
      bestMonth:         best && best.amount > 0 ? { month: best.month, amount: round2(best.amount) } : null,
    },
  }
}

// One analysis per stream (largest first), preceded by the ALL_STREAM aggregate.
// `today` is YYYY-MM-DD in local time.
export function analyseIncomeStreams(entries: IncomeEntry[], today: string): StreamAnalysis[] {
  if (entries.length === 0) return []
  const groups = new Map<string, IncomeEntry[]>()
  for (const e of entries) {
    if (!groups.has(e.stream)) groups.set(e.stream, [])
    groups.get(e.stream)!.push(e)
  }
  const streams = [...groups.values()]
    .map(g => analyse(g[0].stream, g[0].color, g[0].type, g, today))
    .sort((a, b) => b.total - a.total)
  return [analyse(ALL_STREAM, "var(--positive)", "income", entries, today), ...streams]
}
