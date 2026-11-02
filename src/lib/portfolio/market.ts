// Market data: daily prices from Yahoo Finance's public (unofficial) chart API
// and exchange rates from the ECB via Frankfurter, plus ETF constituent files
// from Xtrackers. Only ticker symbols, fund ISINs, currency codes and date
// ranges are sent — never holdings or amounts. Keep all provider
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

// ── Polite HTTP ─────────────────────────────────────────────────────────────
// Free providers throttle bursts (HTTP 429). Requests to each host are spaced
// out, transient failures are retried with growing waits, and a host that keeps
// refusing is left alone for a while instead of being hit once per holding.

export class RateLimitedError extends Error {
  constructor(host: string, retryAt: number) {
    const secs = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000))
    super(`${host} is limiting requests — try again in ${secs < 90 ? `${secs}s` : `${Math.ceil(secs / 60)} min`}`)
    this.name = "RateLimitedError"
  }
}

export const HTTP_POLICY = {
  minGapMs:     300,                // between requests to the same host
  retryDelays:  [2_000, 5_000, 10_000], // after 429 / 5xx / network errors
  maxWaitMs:    30_000,             // cap on a server-requested Retry-After
  coolDownMs:   60_000,             // after retries are exhausted on a 429
  timeoutMs:    15_000,
}

const queues   = new Map<string, Promise<unknown>>()
const lastSent = new Map<string, number>()
const coolDown = new Map<string, number>()
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Seconds or HTTP-date, per RFC 9110. Null when absent or unparseable.
function retryAfterMs(res: Response): number | null {
  const h = res.headers.get("retry-after")
  if (!h) return null
  const secs = Number(h)
  const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(h) - Date.now()
  return Number.isFinite(ms) && ms >= 0 ? Math.min(ms, HTTP_POLICY.maxWaitMs) : null
}

async function attempt<T>(url: string, host: string, read: (res: Response) => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    const wait = (lastSent.get(host) ?? 0) + HTTP_POLICY.minGapMs - Date.now()
    if (wait > 0) await sleep(wait)
    lastSent.set(host, Date.now())

    let res: Response | null = null
    let networkError: unknown = null
    try {
      res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(HTTP_POLICY.timeoutMs) })
    } catch (e) {
      networkError = e
    }
    if (res?.ok) return read(res)

    const retryable = networkError != null || res!.status === 429 || res!.status >= 500
    if (!retryable || i >= HTTP_POLICY.retryDelays.length) {
      if (res?.status === 429) {
        const until = Date.now() + HTTP_POLICY.coolDownMs
        coolDown.set(host, until)
        throw new RateLimitedError(host, until)
      }
      if (networkError) throw new Error(`Couldn't reach ${host}`, { cause: networkError })
      throw new Error(`${host} responded ${res!.status}`)
    }
    const backoff = HTTP_POLICY.retryDelays[i] * (0.8 + Math.random() * 0.4) // jitter
    await sleep((res && retryAfterMs(res)) ?? backoff)
  }
}

// Requests to one host run one at a time, so pacing and back-off apply across
// concurrent refreshes too.
function request<T>(url: string, read: (res: Response) => Promise<T>): Promise<T> {
  const host = new URL(url).host
  const until = coolDown.get(host) ?? 0
  if (Date.now() < until) return Promise.reject(new RateLimitedError(host, until))

  const run = (queues.get(host) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => {
      const blocked = coolDown.get(host) ?? 0
      if (Date.now() < blocked) throw new RateLimitedError(host, blocked)
      return attempt(url, host, read)
    })
  queues.set(host, run)
  return run
}

export const getJson  = (url: string): Promise<unknown> => request(url, res => res.json())
export const getBytes = (url: string): Promise<Buffer> =>
  request(url, async res => Buffer.from(await res.arrayBuffer()))

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
    } catch (e) {
      if (e instanceof RateLimitedError) throw e
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

// ── ETF constituents ────────────────────────────────────────────────────────
// Xtrackers (DWS) publishes each fund's full constituent list as a daily XLSX
// at a stable URL keyed by the fund's ISIN. iShares blocks scripted downloads
// and Vanguard has no stable file URL, so those are uploaded by hand.

const DWS = "https://etf.dws.com"

export const xtrackersConstituentsUrl = (isin: string) =>
  `${DWS}/etfdata/export/CHE/ENG/excel/product/constituent/${encodeURIComponent(isin)}/`

export const fetchConstituentFile = (url: string) => getBytes(url)
