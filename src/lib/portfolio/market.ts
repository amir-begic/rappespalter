// Market data: daily prices from Yahoo Finance's public (unofficial) chart API
// and exchange rates from the ECB via Frankfurter. Only ticker symbols, currency
// codes and date ranges are sent — never holdings or amounts. Keep all provider
// specifics in this file so a source can be swapped without touching the rest.

export const BASE_CURRENCY = "CHF"

const YAHOO = "https://query1.finance.yahoo.com"
const FRANKFURTER = "https://api.frankfurter.dev/v1"
const HEADERS = { "User-Agent": "Mozilla/5.0 (Rappespalter portfolio tracker)" }
const DAY = 86_400

export interface PricePoint { date: string; close: number }
export interface Listing {
  symbol:    string
  currency:  string
  kind:      string | null
  points:    PricePoint[]
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`)
  return res.json()
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10)
const toEpoch = (date: string) => Math.floor(Date.parse(date + "T00:00:00Z") / 1000)

// Some exchanges quote in minor units (London in pence). Normalise to major.
const MINOR_UNITS: Record<string, [string, number]> = {
  GBp: ["GBP", 100], GBX: ["GBP", 100], ZAc: ["ZAR", 100], ILA: ["ILS", 100],
}

type ChartResponse = {
  chart?: {
    error?: { description?: string } | null
    result?: {
      meta: { currency?: string; instrumentType?: string; gmtoffset?: number }
      timestamp?: number[]
      indicators?: { quote?: { close?: (number | null)[] }[] }
    }[]
  }
}

// Daily closes for a listing between two dates (inclusive, YYYY-MM-DD).
export async function fetchListing(symbol: string, from: string, to: string): Promise<Listing> {
  const url = `${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${toEpoch(from)}&period2=${toEpoch(to) + DAY}&interval=1d`
  const data = (await getJson(url)) as ChartResponse
  const result = data.chart?.result?.[0]
  if (!result) throw new Error(data.chart?.error?.description ?? `No data for ${symbol}`)

  const [currency, divisor] = MINOR_UNITS[result.meta.currency ?? ""] ?? [result.meta.currency ?? "", 1]
  const offset = result.meta.gmtoffset ?? 0
  const closes = result.indicators?.quote?.[0]?.close ?? []
  const points: PricePoint[] = []
  ;(result.timestamp ?? []).forEach((ts, i) => {
    const close = closes[i]
    // Date in the exchange's own timezone, so a Zurich close stays on its day.
    if (close != null && Number.isFinite(close)) {
      points.push({ date: isoDate(new Date((ts + offset) * 1000)), close: close / divisor })
    }
  })
  return { symbol, currency, kind: result.meta.instrumentType ?? null, points }
}

type SearchResponse = { quotes?: { symbol?: string; quoteType?: string }[] }

async function searchSymbols(query: string): Promise<string[]> {
  const data = (await getJson(
    `${YAHOO}/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=20&newsCount=0`
  )) as SearchResponse
  return (data.quotes ?? [])
    .filter(q => q.symbol && ["ETF", "EQUITY", "MUTUALFUND", "INDEX"].includes(q.quoteType ?? ""))
    .map(q => q.symbol!)
}

export interface Fingerprint { date: string; currency: string; price: number; name: string }
export interface Match { symbol: string; currency: string; kind: string | null; deviation: number }

// Find the listing that matches a broker trade: a broker symbol like "VWRL"
// trades on many exchanges, so pick the one quoted in the trade's currency
// whose close that day is nearest the price actually paid.
export async function matchListing(brokerSymbol: string, trade: Fingerprint): Promise<Match | null> {
  const base = (s: string) => s.split(".")[0].toUpperCase()
  let candidates = (await searchSymbols(brokerSymbol)).filter(s => base(s) === brokerSymbol.toUpperCase())
  // Broker symbols don't always match the listing's (e.g. share classes), so
  // fall back to searching by name; the price check below keeps this safe.
  if (candidates.length === 0) candidates = (await searchSymbols(trade.name)).slice(0, 8)

  const from = isoDate(new Date(Date.parse(trade.date) - 6 * DAY * 1000))
  let best: Match | null = null
  for (const symbol of [...new Set(candidates)]) {
    try {
      const listing = await fetchListing(symbol, from, trade.date)
      const close = listing.points.at(-1)?.close
      if (!close || listing.currency !== trade.currency) continue
      const deviation = Math.abs(close - trade.price) / trade.price
      if (!best || deviation < best.deviation) best = { symbol, currency: listing.currency, kind: listing.kind, deviation }
    } catch {
      // Thinly traded listings often have no data — just skip them.
    }
  }
  // More than 15% off the traded price means we found the wrong instrument.
  return best && best.deviation <= 0.15 ? best : null
}

type FxResponse = { rates?: Record<string, Record<string, number>> }

// Daily rates (1 `currency` → CHF) between two dates. ECB publishes working days only.
export async function fetchFxRates(currency: string, from: string, to: string): Promise<PricePoint[]> {
  const data = (await getJson(
    `${FRANKFURTER}/${from}..${to}?from=${currency}&to=${BASE_CURRENCY}`
  )) as FxResponse
  return Object.entries(data.rates ?? {})
    .map(([date, r]) => ({ date, close: r[BASE_CURRENCY] }))
    .filter(p => Number.isFinite(p.close))
}
