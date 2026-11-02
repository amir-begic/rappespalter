// Pure projection maths for the Projections page: the forecast to retirement,
// the calculator and the forecast-vs-actual comparison. Checking isn't modelled
// (it's spending money), so every total here is ETF + savings + 3a + 2. Säule.

import type { Settings } from "@/lib/settings"

export interface Balances {
  etf:      number
  savings:  number
  pillar3a: number
  pillar2:  number
}

export const ASSET_KEYS = ["etf", "savings", "pillar3a", "pillar2"] as const
export type AssetKey = (typeof ASSET_KEYS)[number]

// What a forecast assumes per asset: the annual return (compounded monthly) and
// the CHF added every month.
export interface Assumptions {
  rates:   Record<AssetKey, number> // 0.06 = 6% a year
  monthly: Record<AssetKey, number>
}

// Default annual returns. The calculator starts from these; everything else
// (forecast vs. actual, the saved plan) uses them as they are.
export const RATES: Record<AssetKey, number> = {
  etf:      0.06,
  pillar3a: 0.05,
  savings:  0.0075,
  pillar2:  0.025,
}

export const RETIREMENT_AGE = 65 // Swiss reference age (AHV)

// The plan as saved in Settings, with the default returns. The savings account
// gets interest but no contributions (there's no setting for it).
export function assumptionsFrom(s: Pick<Settings, "monthlyEtf" | "monthly3a" | "monthlyPillar2">): Assumptions {
  return {
    rates:   { ...RATES },
    monthly: { etf: s.monthlyEtf, pillar3a: s.monthly3a, savings: 0, pillar2: s.monthlyPillar2 },
  }
}

export const totalOf = (b: Balances) => b.etf + b.savings + b.pillar3a + b.pillar2

export function stepMonth(b: Balances, a: Assumptions): Balances {
  const step = (k: AssetKey) => b[k] * (1 + a.rates[k] / 12) + a.monthly[k]
  return { etf: step("etf"), pillar3a: step("pillar3a"), savings: step("savings"), pillar2: step("pillar2") }
}

/** Balances after `months` months, starting from `start`. */
export function projectAfter(start: Balances, months: number, a: Assumptions): Balances {
  let b = start
  for (let i = 0; i < months; i++) b = stepMonth(b, a)
  return b
}

export interface ForecastPoint extends Balances {
  month:  string // YYYY-MM
  age:    number // whole years, on the 1st of that month
  total:  number
  paidIn: number // contributions so far
}

/**
 * Month by month from `start` (balances in month `from`) until the month the
 * person turns `retirementAge`. One point a year (each birthday month, plus the
 * start and the end); rounded to CHF.
 *
 * With `inflation` (a year, e.g. 0.01) every amount is in today's francs: a
 * franc t years ahead is worth 1 / (1 + inflation)^t now. Contributions stay the
 * same in nominal francs, so they shrink in today's money too.
 */
export function forecastToRetirement(
  start: Balances, from: string, birthDate: string, retirementAge: number, a: Assumptions, inflation = 0,
): ForecastPoint[] {
  const [by, bm] = birthDate.split("-").map(Number)
  const end = `${by + retirementAge}-${String(bm).padStart(2, "0")}`
  const ageIn = (month: string) => {
    const [y, m] = month.split("-").map(Number)
    return y - by - (m < bm ? 1 : 0)
  }
  const monthlyFactor = 1 / Math.pow(1 + inflation, 1 / 12)
  const perMonth = ASSET_KEYS.reduce((sum, k) => sum + a.monthly[k], 0)
  let deflate = 1 // today's francs per franc in the current month
  let paidIn = 0
  const points: ForecastPoint[] = []
  const push = (month: string, b: Balances) => points.push({
    month, age: ageIn(month),
    etf: Math.round(b.etf * deflate), savings: Math.round(b.savings * deflate),
    pillar3a: Math.round(b.pillar3a * deflate), pillar2: Math.round(b.pillar2 * deflate),
    total: Math.round(totalOf(b) * deflate),
    paidIn: Math.round(paidIn),
  })

  let b = start
  push(from, b)
  for (let month = addMonths(from, 1); month <= end; month = addMonths(month, 1)) {
    b = stepMonth(b, a)
    deflate *= monthlyFactor
    paidIn += perMonth * deflate
    if (Number(month.slice(5)) === bm || month === end) push(month, b)
  }
  return points
}

// YYYY-MM arithmetic
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number)
  const i = y * 12 + (m - 1) + n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`
}

export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number)
  const [ty, tm] = to.split("-").map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

export interface ComparisonPoint {
  month:    string
  actual?:  number   // snapshot total, only in months with a snapshot
  plan?:    number   // forecast made at the base snapshot
  current?: number   // forecast from the latest snapshot onwards
}

export interface Comparison {
  base:   string
  latest: string
  points: ComparisonPoint[]
  /** Per asset at the latest snapshot: what happened vs. what the base forecast expected. */
  today:  { actual: Balances; plan: Balances }
}

/**
 * What the forecast made at `base` (a snapshot month) expected, next to what the
 * snapshots recorded, continuing `monthsAhead` months past the latest snapshot
 * together with a fresh forecast from there. Uses today's contributions for the
 * whole span — settings aren't versioned.
 */
export function compareForecast(
  snapshots: (Balances & { month: string })[],
  base: string,
  c: Assumptions,
  monthsAhead = 12,
): Comparison | null {
  const sorted = [...snapshots].sort((a, b) => a.month.localeCompare(b.month))
  const start  = sorted.find(s => s.month === base)
  const last   = sorted[sorted.length - 1]
  if (!start || !last || last.month <= base) return null

  const actualByMonth = new Map(sorted.map(s => [s.month, s]))
  const end = addMonths(last.month, monthsAhead)
  const points: ComparisonPoint[] = []

  let plan: Balances = start
  let current: Balances = last
  for (let month = base; month <= end; month = addMonths(month, 1)) {
    const point: ComparisonPoint = { month, plan: Math.round(totalOf(plan)) }
    const snap = actualByMonth.get(month)
    if (snap) point.actual = Math.round(totalOf(snap))
    if (month >= last.month) {
      point.current = Math.round(totalOf(current))
      current = stepMonth(current, c)
    }
    points.push(point)
    plan = stepMonth(plan, c)
  }

  return {
    base,
    latest: last.month,
    points,
    today: {
      actual: pick(last),
      plan:   projectAfter(pick(start), monthsBetween(base, last.month), c),
    },
  }
}

const pick = (b: Balances): Balances =>
  ({ etf: b.etf, savings: b.savings, pillar3a: b.pillar3a, pillar2: b.pillar2 })
