// Portfolio maths — pure functions over stored activities, prices and FX rates,
// so it can be tested without a database or network. All results are in CHF.
//
// The account is modelled as securities + cash. Deposits and withdrawals are
// the only external cash flows; trades, dividends and fees happen inside it.

import { BASE_CURRENCY } from "./market"

export interface EngineActivity {
  date:            string // YYYY-MM-DD
  type:            string
  symbol:          string | null
  quantity:        number | null
  price:           number | null
  amount:          number
  currency:        string
  fee:             number
  tax:             number
  counterAmount:   number | null
  counterCurrency: string | null
}

export interface EngineSecurity {
  symbol:        string
  name:          string
  currency:      string
  kind:          string | null
  priceCurrency: string | null
  priceSource:   string
  priceSymbol:   string | null
}

export type Series = Map<string, { date: string; value: number }[]> // sorted by date

export interface Holding {
  symbol:        string
  name:          string
  kind:          string | null
  units:         number
  costBasis:     number // CHF, fees included
  avgCost:       number // CHF per unit
  price:         number | null // latest close, in priceCurrency
  priceCurrency: string
  priceDate:     string | null
  priceIsTrade:  boolean // no market price — using the last trade price
  value:         number
  gain:          number
  gainPct:       number | null
  weight:        number
  realizedGain:  number
  dividends:     number // net, CHF, all time
  dividendsTtm:  number // net, CHF, last 12 months
  yieldOnCost:   number | null // trailing 12 months net ÷ cost basis
}

// Something the maths had to work around, as data: the pages word it in the
// language in use (pfwarn.* messages).
export type PortfolioWarning =
  | { code: "noFx"; currency: string }
  | { code: "noMarketPriceNamed"; name: string }
  | { code: "noMarketPrice" }

export interface PortfolioResult {
  asOf:        string
  start:       string | null
  totals: {
    value:          number
    securities:     number
    cash:           number
    netDeposits:    number
    gain:           number // value − net deposits
    gainPct:        number | null
    unrealizedGain: number
    realizedGain:   number
    dividends:      number // net
    withholdingTax: number
    fees:           number
    feesTtm:        number // trading & FX fees, last 12 months
    twr:            number | null // time-weighted, cumulative
    twrAnnualized:  number | null // only for periods ≥ 1 year
    irr:            number | null // money-weighted, annualised
  }
  series:     { date: string; value: number; invested: number }[]
  holdings:   Holding[]
  dividends:  { month: string; net: number; tax: number }[]
  warnings:   PortfolioWarning[]
}

// Walks a date-sorted series forward, returning the latest value on/before a
// date. Callers query in ascending order, so this stays O(n) overall.
function cursor(points: { date: string; value: number }[] | undefined) {
  let i = -1
  return (date: string): { date: string; value: number } | null => {
    if (!points?.length) return null
    while (i + 1 < points.length && points[i + 1].date <= date) i++
    return i >= 0 ? points[i] : null
  }
}

const addDays = (date: string, n: number) =>
  new Date(Date.parse(date + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10)

const yearsBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / (365.25 * 86_400_000)

// Money-weighted return: the annual rate r where Σ flow·(1+r)^−t = 0.
export function xirr(flows: { date: string; amount: number }[]): number | null {
  if (flows.length < 2 || !flows.some(f => f.amount > 0) || !flows.some(f => f.amount < 0)) return null
  const t0 = flows[0].date
  const npv = (r: number) => flows.reduce((s, f) => s + f.amount / Math.pow(1 + r, yearsBetween(t0, f.date)), 0)
  // Bisection: robust where Newton overshoots on short or lumpy histories.
  let lo = -0.9999, hi = 100
  let fLo = npv(lo)
  if (fLo * npv(hi) > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, fMid = npv(mid)
    if (Math.abs(fMid) < 1e-7) return mid
    if (fLo * fMid < 0) hi = mid
    else { lo = mid; fLo = fMid }
  }
  return (lo + hi) / 2
}

export function computePortfolio(input: {
  activities: EngineActivity[]
  securities: EngineSecurity[]
  prices:     Series // by Security.symbol
  fx:         Series // by currency, 1 unit → CHF
  today:      string
}, opts: { fullSeries?: boolean } = {}): PortfolioResult {
  const { securities, prices, fx, today } = input
  const activities = [...input.activities].sort((a, b) => a.date.localeCompare(b.date))
  const warnings = new Map<string, PortfolioWarning>()
  const warn = (w: PortfolioWarning) => warnings.set(JSON.stringify(w), w)
  const secBySymbol = new Map(securities.map(s => [s.symbol, s]))

  // FX lookups, cursor-based for the daily walk plus a random-access variant.
  const fxCursors = new Map<string, ReturnType<typeof cursor>>()
  const fxAt = (ccy: string, date: string): number => {
    if (!ccy || ccy === BASE_CURRENCY) return 1
    if (!fxCursors.has(ccy)) fxCursors.set(ccy, cursor(fx.get(ccy)))
    const hit = fxCursors.get(ccy)!(date) ?? fx.get(ccy)?.[0] // before first rate: use earliest
    if (!hit) { warn({ code: "noFx", currency: ccy }); return 0 }
    return hit.value
  }
  const fxOn = (ccy: string, date: string): number => {
    if (!ccy || ccy === BASE_CURRENCY) return 1
    const pts = fx.get(ccy)
    if (!pts?.length) { warn({ code: "noFx", currency: ccy }); return 0 }
    let best = pts[0]
    for (const p of pts) { if (p.date <= date) best = p; else break }
    return best.value
  }

  const units    = new Map<string, number>()
  const cost     = new Map<string, number>() // CHF cost basis of units held
  const realized = new Map<string, number>()
  const divs     = new Map<string, number>()
  const divsTtm  = new Map<string, number>()
  const lastTrade = new Map<string, { date: string; price: number; currency: string }>()
  const cash = new Map<string, number>()
  const ttmStart = addDays(today, -365)
  const byMonth = new Map<string, { net: number; tax: number }>()
  let fees = 0, feesTtm = 0, dividends = 0, withholding = 0
  const addFee = (a: EngineActivity) => {
    const chf = a.fee * fxOn(a.currency, a.date)
    fees += chf
    if (a.date > ttmStart) feesTtm += chf
  }

  const priceCursors = new Map(securities.map(s => [s.symbol, cursor(prices.get(s.symbol))]))

  // Price of one unit in CHF on a date: market close if we have one, otherwise
  // the last trade price (flagged in the holdings table).
  const unitValue = (symbol: string, date: string): number => {
    const sec = secBySymbol.get(symbol)
    const market = priceCursors.get(symbol)?.(date)
    if (market && sec) return market.value * fxAt(sec.priceCurrency ?? sec.currency, date)
    const t = lastTrade.get(symbol)
    return t ? t.price * fxAt(t.currency, date) : 0
  }

  const applyActivity = (a: EngineActivity): number => {
    let flow = 0
    cash.set(a.currency, (cash.get(a.currency) ?? 0) + a.amount)
    const chf = a.amount * fxOn(a.currency, a.date)

    switch (a.type) {
      case "buy": {
        if (!a.symbol || !a.quantity) break
        units.set(a.symbol, (units.get(a.symbol) ?? 0) + a.quantity)
        cost.set(a.symbol, (cost.get(a.symbol) ?? 0) + Math.abs(chf))
        addFee(a)
        if (a.price) lastTrade.set(a.symbol, { date: a.date, price: a.price, currency: a.currency })
        break
      }
      case "sell": {
        if (!a.symbol || !a.quantity) break
        const held = units.get(a.symbol) ?? 0
        const basis = cost.get(a.symbol) ?? 0
        const soldCost = held > 0 ? basis * Math.min(1, a.quantity / held) : 0
        units.set(a.symbol, held - a.quantity)
        cost.set(a.symbol, basis - soldCost)
        realized.set(a.symbol, (realized.get(a.symbol) ?? 0) + (chf - soldCost))
        addFee(a)
        if (a.price) lastTrade.set(a.symbol, { date: a.date, price: a.price, currency: a.currency })
        break
      }
      case "dividend": {
        const tax = a.tax * fxOn(a.currency, a.date)
        dividends += chf
        withholding += tax
        const m = byMonth.get(a.date.slice(0, 7)) ?? { net: 0, tax: 0 }
        m.net += chf; m.tax += tax
        byMonth.set(a.date.slice(0, 7), m)
        if (a.symbol) {
          divs.set(a.symbol, (divs.get(a.symbol) ?? 0) + chf)
          if (a.date > ttmStart) divsTtm.set(a.symbol, (divsTtm.get(a.symbol) ?? 0) + chf)
        }
        break
      }
      case "fx": {
        if (a.counterCurrency && a.counterAmount != null) {
          cash.set(a.counterCurrency, (cash.get(a.counterCurrency) ?? 0) + a.counterAmount)
        }
        addFee(a)
        break
      }
      case "deposit":
      case "withdrawal":
        flow = chf
        break
    }
    return flow
  }

  // ── Daily walk ────────────────────────────────────────────────────────────
  const series: PortfolioResult["series"] = []
  const irrFlows: { date: string; amount: number }[] = []
  let twrFactor = 1, prevValue = 0, invested = 0, idx = 0
  const start = activities[0]?.date ?? null

  const valueOn = (date: string) => {
    let v = 0
    for (const [sym, u] of units) if (Math.abs(u) > 1e-9) v += u * unitValue(sym, date)
    for (const [ccy, amt] of cash) v += amt * fxAt(ccy, date)
    return v
  }

  if (start) {
    for (let date = start; date <= today; date = addDays(date, 1)) {
      let flow = 0
      while (idx < activities.length && activities[idx].date <= date) flow += applyActivity(activities[idx++])
      invested += flow
      if (flow !== 0) irrFlows.push({ date, amount: -flow })

      const value = valueOn(date)
      if (prevValue > 1e-6) twrFactor *= (value - flow) / prevValue
      prevValue = value
      series.push({ date, value, invested })
    }
  }

  const last = series.at(-1)
  const totalValue = last?.value ?? 0
  if (last && totalValue > 0) irrFlows.push({ date: today, amount: totalValue })

  // ── Holdings ──────────────────────────────────────────────────────────────
  const holdings: Holding[] = []
  const symbols = new Set([...units.keys(), ...realized.keys(), ...divs.keys()])
  let securitiesValue = 0
  for (const symbol of symbols) {
    const sec = secBySymbol.get(symbol)
    const u = units.get(symbol) ?? 0
    const held = Math.abs(u) > 1e-9
    const market = prices.get(symbol)?.filter(p => p.date <= today).at(-1) ?? null
    const trade = lastTrade.get(symbol)
    const priceIsTrade = held && !market
    if (priceIsTrade) warn({ code: "noMarketPriceNamed", name: sec?.name ?? symbol })
    const value = held ? u * (market
      ? market.value * fxOn(sec?.priceCurrency ?? sec?.currency ?? BASE_CURRENCY, today)
      : (trade ? trade.price * fxOn(trade.currency, today) : 0)) : 0
    const costBasis = held ? (cost.get(symbol) ?? 0) : 0
    securitiesValue += value
    holdings.push({
      symbol,
      name:          sec?.name ?? symbol,
      kind:          sec?.kind ?? null,
      units:         held ? u : 0,
      costBasis,
      avgCost:       held ? costBasis / u : 0,
      price:         market?.value ?? trade?.price ?? null,
      priceCurrency: market ? (sec?.priceCurrency ?? sec?.currency ?? BASE_CURRENCY) : (trade?.currency ?? sec?.currency ?? BASE_CURRENCY),
      priceDate:     market?.date ?? trade?.date ?? null,
      priceIsTrade,
      value,
      gain:          value - costBasis,
      gainPct:       costBasis > 0 ? (value - costBasis) / costBasis : null,
      weight:        0,
      realizedGain:  realized.get(symbol) ?? 0,
      dividends:     divs.get(symbol) ?? 0,
      dividendsTtm:  divsTtm.get(symbol) ?? 0,
      yieldOnCost:   costBasis > 0 ? (divsTtm.get(symbol) ?? 0) / costBasis : null,
    })
  }
  for (const h of holdings) h.weight = securitiesValue > 0 ? h.value / securitiesValue : 0
  holdings.sort((a, b) => b.value - a.value || b.realizedGain - a.realizedGain)

  let cashChf = 0
  for (const [ccy, amt] of cash) cashChf += amt * fxOn(ccy, today)
  const unrealizedGain = holdings.reduce((s, h) => s + h.gain, 0)
  const realizedGain = holdings.reduce((s, h) => s + h.realizedGain, 0)
  const years = start ? yearsBetween(start, today) : 0
  const twr = series.length > 1 ? twrFactor - 1 : null

  return {
    asOf: today,
    start,
    totals: {
      value:          totalValue,
      securities:     securitiesValue,
      cash:           cashChf,
      netDeposits:    invested,
      gain:           totalValue - invested,
      gainPct:        invested > 0 ? (totalValue - invested) / invested : null,
      unrealizedGain,
      realizedGain,
      dividends,
      withholdingTax: withholding,
      fees,
      feesTtm,
      twr,
      twrAnnualized:  twr != null && years >= 1 ? Math.pow(1 + twr, 1 / years) - 1 : null,
      irr:            xirr(irrFlows),
    },
    // Long histories are thinned to weekly points (plus the latest) for charting.
    series: series.length > 800 && !opts.fullSeries
      ? series.filter((_, i) => i % 7 === 0 || i === series.length - 1)
      : series,
    holdings,
    dividends: [...byMonth].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v })),
    warnings: [...warnings.values()],
  }
}

// ── Single holding ──────────────────────────────────────────────────────────

// Latest point on/before `date` in a date-sorted series (binary search).
export function latestOn<T extends { date: string }>(points: T[] | undefined, date: string): T | null {
  if (!points?.length) return null
  let lo = 0, hi = points.length - 1, found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (points[mid].date <= date) { found = mid; lo = mid + 1 } else hi = mid - 1
  }
  return found >= 0 ? points[found] : null
}

export interface HoldingTrade {
  date:          string
  type:          "buy" | "sell"
  quantity:      number
  price:         number // per unit, trade currency
  priceQuoted:   number // per unit, converted to the listing's currency
  amount:        number // signed, trade currency (fee included)
  currency:      string
  fee:           number
}

export interface HoldingDetail {
  symbol:        string
  name:          string
  kind:          string | null
  currency:      string // trade currency
  priceCurrency: string // currency of the price line, avg cost and markers
  stats: {
    units:          number
    avgCost:        number | null // per unit, priceCurrency, fees included
    avgCostChf:     number | null
    price:          number | null // latest, priceCurrency
    priceDate:      string | null
    priceIsTrade:   boolean
    value:          number // CHF
    costBasis:      number // CHF
    unrealized:     number
    unrealizedPct:  number | null
    realized:       number
    dividends:      number // net CHF
    withholdingTax: number
    fees:           number // CHF
    totalBought:    number // CHF paid for all buys
    totalReturn:    number // unrealized + realized + dividends
    totalReturnPct: number | null // ÷ totalBought
    firstBuy:       string | null
    priceChangeSinceFirstBuy: number | null
  }
  series: {
    date:    string
    price:   number | null // market close, priceCurrency
    avgCost: number | null // priceCurrency
    value:   number        // position value, CHF
    cost:    number        // cost basis, CHF
    buy?:    number        // avg price of buys that day, priceCurrency
    sell?:   number
  }[]
  trades:    HoldingTrade[]
  dividends: { date: string; amount: number; currency: string; tax: number; chf: number }[]
  warnings:  PortfolioWarning[]
}

export function computeHoldingDetail(input: {
  activities: EngineActivity[]
  securities: EngineSecurity[]
  prices:     Series
  fx:         Series
  today:      string
}, symbol: string): HoldingDetail | null {
  const sec = input.securities.find(s => s.symbol === symbol)
  const acts = input.activities
    .filter(a => a.symbol === symbol && (a.type === "buy" || a.type === "sell" || a.type === "dividend"))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (!sec && acts.length === 0) return null

  const warnings = new Map<string, PortfolioWarning>()
  const warn = (w: PortfolioWarning) => warnings.set(JSON.stringify(w), w)
  const tradeCcy = sec?.currency ?? acts.find(a => a.type !== "dividend")?.currency ?? BASE_CURRENCY
  const priceCcy = sec?.priceCurrency ?? tradeCcy
  const prices = input.prices.get(symbol)

  const fxOn = (ccy: string, date: string) => {
    if (ccy === BASE_CURRENCY) return 1
    const pts = input.fx.get(ccy)
    const hit = latestOn(pts, date) ?? pts?.[0]
    if (!hit) { warn({ code: "noFx", currency: ccy }); return 0 }
    return hit.value
  }
  // Convert an amount into the listing's currency (via CHF) on a date.
  const toQuoted = (amount: number, ccy: string, date: string) => {
    if (ccy === priceCcy) return amount
    const target = fxOn(priceCcy, date)
    return target ? amount * fxOn(ccy, date) / target : amount
  }

  const trades: HoldingTrade[] = acts
    .filter((a): a is EngineActivity & { type: "buy" | "sell" } => (a.type === "buy" || a.type === "sell") && !!a.quantity)
    .map(a => ({
      date: a.date, type: a.type, quantity: a.quantity!, price: a.price ?? Math.abs(a.amount) / a.quantity!,
      priceQuoted: toQuoted(a.price ?? Math.abs(a.amount) / a.quantity!, a.currency, a.date),
      amount: a.amount, currency: a.currency, fee: a.fee,
    }))

  const dividends = acts.filter(a => a.type === "dividend").map(a => ({
    date: a.date, amount: a.amount, currency: a.currency, tax: a.tax, chf: a.amount * fxOn(a.currency, a.date),
  }))

  // ── Daily walk from the first trade ──
  let units = 0, costChf = 0, costQuoted = 0, realized = 0, fees = 0, totalBought = 0
  let lastTradeQuoted: number | null = null
  const series: HoldingDetail["series"] = []
  const start = trades[0]?.date ?? null
  let ti = 0

  if (start) {
    for (let date = start; date <= input.today; date = addDays(date, 1)) {
      const buys: HoldingTrade[] = [], sells: HoldingTrade[] = []
      while (ti < trades.length && trades[ti].date <= date) {
        const t = trades[ti++]
        const chf = Math.abs(t.amount) * fxOn(t.currency, t.date)
        fees += t.fee * fxOn(t.currency, t.date)
        if (t.type === "buy") {
          units += t.quantity
          costChf += chf
          costQuoted += toQuoted(Math.abs(t.amount), t.currency, t.date)
          totalBought += chf
          buys.push(t)
        } else {
          const share = units > 0 ? Math.min(1, t.quantity / units) : 0
          realized += chf - costChf * share
          costChf -= costChf * share
          costQuoted -= costQuoted * share
          units -= t.quantity
          sells.push(t)
        }
        lastTradeQuoted = t.priceQuoted
      }

      const market = latestOn(prices, date)
      const unitPrice = market?.value ?? lastTradeQuoted ?? 0
      const held = units > 1e-9
      const avg = (ts: HoldingTrade[]) =>
        ts.length ? ts.reduce((s, t) => s + t.priceQuoted * t.quantity, 0) / ts.reduce((s, t) => s + t.quantity, 0) : undefined
      series.push({
        date,
        price:   market?.value ?? null,
        avgCost: held ? costQuoted / units : null,
        value:   held ? units * unitPrice * fxOn(priceCcy, date) : 0,
        cost:    held ? costChf : 0,
        ...(buys.length ? { buy: avg(buys) } : {}),
        ...(sells.length ? { sell: avg(sells) } : {}),
      })
    }
  }

  const held = units > 1e-9
  const market = latestOn(prices, input.today)
  const price = market?.value ?? lastTradeQuoted
  if (held && !market) warn({ code: "noMarketPrice" })
  const value = held && price != null ? units * price * fxOn(priceCcy, input.today) : 0
  const costBasis = held ? costChf : 0
  const unrealized = value - costBasis
  const dividendsChf = dividends.reduce((s, d) => s + d.chf, 0)
  const totalReturn = unrealized + realized + dividendsChf
  const firstBuy = trades.find(t => t.type === "buy")

  return {
    symbol,
    name:          sec?.name ?? symbol,
    kind:          sec?.kind ?? null,
    currency:      tradeCcy,
    priceCurrency: priceCcy,
    stats: {
      units:          held ? units : 0,
      avgCost:        held ? costQuoted / units : null,
      avgCostChf:     held ? costChf / units : null,
      price,
      priceDate:      market?.date ?? trades.at(-1)?.date ?? null,
      priceIsTrade:   held && !market,
      value,
      costBasis,
      unrealized,
      unrealizedPct:  costBasis > 0 ? unrealized / costBasis : null,
      realized,
      dividends:      dividendsChf,
      withholdingTax: dividends.reduce((s, d) => s + d.tax * fxOn(d.currency, d.date), 0),
      fees,
      totalBought,
      totalReturn,
      totalReturnPct: totalBought > 0 ? totalReturn / totalBought : null,
      firstBuy:       firstBuy?.date ?? null,
      priceChangeSinceFirstBuy: firstBuy && price != null ? price / firstBuy.priceQuoted - 1 : null,
    },
    series: series.length > 800 ? series.filter((p, i) => i % 7 === 0 || i === series.length - 1 || p.buy != null || p.sell != null) : series,
    trades,
    dividends,
    warnings: [...warnings.values()],
  }
}
