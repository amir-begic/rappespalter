// Pure projection maths for the Projections page: the 15-year forecast and the
// forecast-vs-actual comparison. Checking isn't modelled (it's spending money),
// so every total here is ETF + savings + 3a + 2. Säule.

import type { Settings } from "@/lib/settings"

export interface Balances {
  etf:      number
  savings:  number
  pillar3a: number
  pillar2:  number
}

export type Contributions = Pick<Settings, "monthlyEtf" | "monthly3a" | "monthlyPillar2">

// Annual returns, compounded monthly. Savings get interest but no contributions.
export const RATES = {
  etf:      0.06,
  pillar3a: 0.05,
  savings:  0.0075,
  pillar2:  0.025,
} as const

export const ASSET_KEYS = ["etf", "savings", "pillar3a", "pillar2"] as const

export const totalOf = (b: Balances) => b.etf + b.savings + b.pillar3a + b.pillar2

export function stepMonth(b: Balances, c: Contributions): Balances {
  return {
    etf:      b.etf      * (1 + RATES.etf / 12)      + c.monthlyEtf,
    pillar3a: b.pillar3a * (1 + RATES.pillar3a / 12) + c.monthly3a,
    savings:  b.savings  * (1 + RATES.savings / 12),
    pillar2:  b.pillar2  * (1 + RATES.pillar2 / 12)  + c.monthlyPillar2,
  }
}

/** Balances after `months` months, starting from `start`. */
export function projectAfter(start: Balances, months: number, c: Contributions): Balances {
  let b = start
  for (let i = 0; i < months; i++) b = stepMonth(b, c)
  return b
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
  c: Contributions,
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
