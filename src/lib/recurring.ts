// Recurring payments: standing orders, premiums, subscriptions, salary. Pure,
// like budget-drift.ts — the route loads transactions and passes them in.
//
// Payments are grouped by payee (payeeName: "Dauerauftrag X" and "Instant-Zahlung
// X" are both X) and direction. A group whose dates follow a monthly, quarterly,
// half-yearly or yearly rhythm is one series. When it doesn't (two premiums to
// the same insurer on the same days), it is split by amount and each part is
// tried on its own.
//
// "Today" is the latest import date: anything after it isn't in the data yet,
// so a payment isn't missing just because the export is a few weeks old.

import { payeeName } from "./counterparty"

export interface RecurringInput {
  date:         string // YYYY-MM-DD
  counterparty: string // as resolved by the parser (resolveCounterparty)
  amount:       number // signed
  category:     string | null
  color:        string | null
  categoryType: string | null
}

export type Cadence = "monthly" | "quarterly" | "half-yearly" | "yearly"

// min/max: the gap in days between payments. grace: days late before a payment
// counts as missing. Long rhythms are easy to match by chance (two dinners a
// year apart), so they need every gap to fit and a near-constant amount.
const CADENCES: { cadence: Cadence; months: number; min: number; max: number; grace: number; strict: boolean }[] = [
  { cadence: "monthly",     months: 1,  min: 20,  max: 40,  grace: 7,  strict: false },
  { cadence: "quarterly",   months: 3,  min: 80,  max: 100, grace: 14, strict: false },
  { cadence: "half-yearly", months: 6,  min: 170, max: 195, grace: 21, strict: true },
  { cadence: "yearly",      months: 12, min: 345, max: 385, grace: 30, strict: true },
]
const MIN_PAYMENTS = 3

export interface RecurringSeries {
  key:          string
  name:         string               // payee
  direction:    "in" | "out"
  cadence:      Cadence
  perYear:      number               // payments a year
  amount:       number               // > 0, the latest payment
  typical:      number               // > 0, expected next payment
  variable:     boolean              // the amount varies (e.g. electricity)
  yearly:       number               // > 0, typical × payments a year
  count:        number
  first:        string
  last:         string
  next:         string               // expected date of the next payment
  status:       "expected" | "missing"
  change:       { from: number; to: number; on: string } | null // fixed amount that changed
  category:     string | null
  color:        string | null
  categoryType: string | null
  history:      { date: string; amount: number }[] // latest first, up to 12
}

export interface RecurringResult {
  asOf:     string
  series:   RecurringSeries[]                    // active, by yearly amount
  upcoming: (RecurringSeries & { inDays: number })[] // outgoing, due in the next 30 days
}

const DAY = 86_400_000
const toTime = (d: string) => Date.parse(d + "T00:00:00Z")
const daysBetween = (a: string, b: string) => Math.round((toTime(b) - toTime(a)) / DAY)
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const monthIndex = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1

// Same day of month, `n` months on (clamped: 31 Jan + 1 month = 28/29 Feb).
export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number)
  const i = y * 12 + (m - 1) + n
  const ny = Math.floor(i / 12), nm = i % 12
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate()
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`
}

const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.max(a, b) * 0.01)

// The rhythm of a set of payments (sorted by date), or null if there isn't one.
function findCadence(items: RecurringInput[]) {
  const dates = items.map(i => i.date)
  // Gaps of a few days are one period's payment booked twice or around a month
  // end (31 Aug, 2 Sep) — they don't tell the rhythm.
  const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d)).filter(g => g >= 10)
  if (!gaps.length) return null
  const gap = median(gaps)
  const c = CADENCES.find(c => gap >= c.min && gap <= c.max)
  if (!c) return null
  if (c.strict && gaps.some(g => g < c.min || g > c.max)) return null

  // Most periods between the first and last payment must have one, and most
  // shouldn't have several (a shop visited often isn't a subscription).
  const periodOf = (d: string) => Math.floor(monthIndex(d) / c.months)
  const periods = new Set(dates.map(periodOf))
  const span = periodOf(dates.at(-1)!) - periodOf(dates[0]) + 1
  if (periods.size < MIN_PAYMENTS) return null
  if (periods.size / span < 0.75) return null
  if (items.length / periods.size > 1.5) return null
  return c
}

function toSeries(key: string, items: RecurringInput[], asOf: string): RecurringSeries | null {
  const c = findCadence(items)
  if (!c) return null

  const amounts = items.map(i => Math.abs(i.amount))
  const lastItem = items.at(-1)!
  const amount = amounts.at(-1)!

  // Fixed if the recent payments mostly repeat one amount; a single change
  // (3'010 → 3'100) is reported. Otherwise variable, and the typical amount
  // is the recent average.
  const recent = amounts.slice(-Math.max(3, Math.round(12 / c.months)))
  const repeats = recent.slice(1).filter((a, i) => close(a, recent[i])).length
  const variable = recent.length > 2 && repeats / (recent.length - 1) < 0.5
  if (variable) {
    const mean = recent.reduce((s, a) => s + a, 0) / recent.length
    const spread = Math.sqrt(recent.reduce((s, a) => s + (a - mean) ** 2, 0) / recent.length) / mean
    if (spread > (c.strict ? 0.15 : 0.5)) return null // too erratic to call recurring
  }
  const typical = variable ? recent.reduce((s, a) => s + a, 0) / recent.length : amount

  // A fixed amount that changed within the last three payments, after being
  // stable before: report it until it's old news.
  let change: RecurringSeries["change"] = null
  if (!variable) {
    let i = amounts.length - 1
    while (i > 0 && close(amounts[i - 1], amount)) i--
    if (i >= 2 && i >= amounts.length - 3 && close(amounts[i - 2], amounts[i - 1])) {
      change = { from: amounts[i - 1], to: amount, on: items[i].date }
    }
  }

  const next = addMonths(lastItem.date, c.months)
  const late = daysBetween(next, asOf)
  // Missing for a while, then assumed stopped (at most a quarter for long rhythms).
  if (late > c.grace + Math.min(c.months * 31, 92)) return null
  const status = late > c.grace ? "missing" : "expected"

  const perYear = 12 / c.months
  return {
    key,
    name:         payeeName(lastItem.counterparty),
    direction:    lastItem.amount < 0 ? "out" : "in",
    cadence:      c.cadence,
    perYear,
    amount:       round2(amount),
    typical:      round2(typical),
    variable,
    yearly:       round2(typical * perYear),
    count:        items.length,
    first:        items[0].date,
    last:         lastItem.date,
    next,
    status,
    change,
    category:     lastItem.category,
    color:        lastItem.color,
    categoryType: lastItem.categoryType,
    history:      items.slice(-12).reverse().map(i => ({ date: i.date, amount: Math.abs(i.amount) })),
  }
}

// Splits payments to one payee into groups of similar amounts (within 25%).
function byAmount(items: RecurringInput[]): RecurringInput[][] {
  const sorted = [...items].sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount))
  const groups: RecurringInput[][] = []
  for (const it of sorted) {
    const g = groups.at(-1)
    if (g && Math.abs(it.amount) <= Math.abs(g[0].amount) * 1.25) g.push(it)
    else groups.push([it])
  }
  return groups.map(g => g.sort((a, b) => a.date.localeCompare(b.date)))
}

export function findRecurring(transactions: RecurringInput[], asOf: string): RecurringResult {
  const groups = new Map<string, RecurringInput[]>()
  for (const t of transactions) {
    if (!t.amount) continue
    const key = `${t.amount < 0 ? "out" : "in"}:${payeeName(t.counterparty).toLowerCase().replace(/\s+/g, " ")}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  }

  const series: RecurringSeries[] = []
  for (const [key, items] of groups) {
    items.sort((a, b) => a.date.localeCompare(b.date))
    const whole = toSeries(key, items, asOf)
    if (whole) { series.push(whole); continue }
    byAmount(items).forEach((part, i) => {
      const s = toSeries(`${key}#${i}`, part, asOf)
      if (s) series.push(s)
    })
  }
  series.sort((a, b) => b.yearly - a.yearly)

  const upcoming = series
    .filter(s => s.direction === "out")
    .map(s => ({ ...s, inDays: daysBetween(asOf, s.next) }))
    .filter(s => s.inDays <= 30 && s.status === "expected")
    .sort((a, b) => a.next.localeCompare(b.next))

  return { asOf, series, upcoming }
}

const round2 = (n: number) => Math.round(n * 100) / 100
