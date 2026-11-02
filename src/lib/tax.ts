// Figures for the yearly tax return (Tax page). Pure; the route loads the data.
// This collects what the app knows — it doesn't apply tax rules, which differ by
// canton and year.

import { latestOn, type EngineActivity, type EngineSecurity, type Series } from "./portfolio/engine"
import { BASE_CURRENCY } from "./portfolio/market"

export interface TaxDividend {
  symbol:   string
  name:     string
  currency: string
  payments: number
  gross:    number // in `currency`: net + withholding tax
  tax:      number // withholding tax, in `currency`
  net:      number
  grossChf: number // each payment at its day's ECB rate
  taxChf:   number
  netChf:   number
}

// Dividends paid in `year`, per security. The broker books them net of
// withholding tax (`tax`), so gross = net + tax.
export function dividendsForYear(
  activities: EngineActivity[],
  securities: EngineSecurity[],
  fx: Series,
  year: number,
): TaxDividend[] {
  const names = new Map(securities.map(s => [s.symbol, s.name]))
  const rate = (ccy: string, date: string) =>
    ccy === BASE_CURRENCY ? 1 : (latestOn(fx.get(ccy), date) ?? fx.get(ccy)?.[0])?.value ?? 0
  const bySymbol = new Map<string, TaxDividend>()

  for (const a of activities) {
    if (a.type !== "dividend" || !a.date.startsWith(`${year}-`)) continue
    const symbol = a.symbol ?? "?"
    const d = bySymbol.get(symbol) ?? {
      symbol, name: names.get(symbol) ?? symbol, currency: a.currency, payments: 0,
      gross: 0, tax: 0, net: 0, grossChf: 0, taxChf: 0, netChf: 0,
    }
    const r = rate(a.currency, a.date)
    d.payments++
    d.net += a.amount
    d.tax += a.tax
    d.gross += a.amount + a.tax
    d.netChf += a.amount * r
    d.taxChf += a.tax * r
    d.grossChf += (a.amount + a.tax) * r
    bySymbol.set(symbol, d)
  }
  return [...bySymbol.values()].map(d => ({
    ...d,
    gross: round2(d.gross), tax: round2(d.tax), net: round2(d.net),
    grossChf: round2(d.grossChf), taxChf: round2(d.taxChf), netChf: round2(d.netChf),
  })).sort((a, b) => b.grossChf - a.grossChf)
}

// The snapshot that best stands for balances on 31 December: snapshots are
// entered early in a month, so January of the next year comes first, then
// December, then the latest one in the year.
export function yearEndSnapshot<T extends { month: string }>(snapshots: T[], year: number): T | null {
  const by = new Map(snapshots.map(s => [s.month, s]))
  return by.get(`${year + 1}-01`)
    ?? by.get(`${year}-12`)
    ?? [...snapshots].filter(s => s.month.startsWith(`${year}-`)).sort((a, b) => b.month.localeCompare(a.month))[0]
    ?? null
}

const round2 = (n: number) => Math.round(n * 100) / 100
