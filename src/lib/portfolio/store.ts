import { prisma } from "@/lib/prisma"
import { ensurePortfolioSchema } from "./schema"
import { ensureSettingTable } from "@/lib/setting-table"
import {
  BASE_CURRENCY, fetchFxRates, fetchListing, fetchConstituentFile, matchListing, xtrackersConstituentsUrl,
} from "./market"
import { computeHoldingDetail, computePortfolio, type Series } from "./engine"
import { parseConstituentFile, providerLabel, type AssetClass, type ConstituentFile } from "./constituents"
import { computeLookThrough } from "./lookthrough"
import type { ParseResult } from "./yuh"

const iso = (d: Date) => d.toISOString().slice(0, 10)
const today = () => iso(new Date())
const minusDays = (date: string, n: number) => iso(new Date(Date.parse(date) - n * 86_400_000))

// ── Import ──────────────────────────────────────────────────────────────────

export async function importActivities(parsed: ParseResult) {
  await ensurePortfolioSchema()

  // New securities get a row; existing ones keep their (possibly user-set) pricing.
  for (const [symbol, s] of parsed.securities) {
    await prisma.security.upsert({
      where:  { symbol },
      update: {},
      create: { symbol, name: s.name, currency: s.currency },
    })
  }

  // Dividends whose security wasn't traded in this file: match by stored name.
  const known = await prisma.security.findMany({ select: { symbol: true, name: true } })
  const byName = new Map(known.map(s => [s.name.toLowerCase(), s.symbol]))

  const existing = new Set(
    (await prisma.portfolioActivity.findMany({
      where:  { sourceHash: { in: parsed.activities.map(a => a.sourceHash) } },
      select: { sourceHash: true },
    })).map(r => r.sourceHash)
  )
  const fresh = parsed.activities.filter(a => !existing.has(a.sourceHash))

  await prisma.portfolioActivity.createMany({
    data: fresh.map(({ securityName, ...a }) => ({
      ...a,
      symbol: a.symbol ?? (securityName ? byName.get(securityName.toLowerCase()) ?? null : null),
    })),
  })

  return { imported: fresh.length, skipped: parsed.activities.length - fresh.length }
}

// ── Market data refresh ────────────────────────────────────────────────────

// Automatic refreshes (on opening the Portfolio page) run at most this often;
// manual refreshes and imports always run. The attempt time is stored even when
// the price service fails, so an outage or rate limit isn't retried on every visit.
export const AUTO_REFRESH_HOURS = 4
const LAST_REFRESH_KEY = "portfolio.lastRefreshAt"

export async function getLastRefresh(): Promise<string | null> {
  await ensureSettingTable()
  return (await prisma.setting.findUnique({ where: { key: LAST_REFRESH_KEY } }))?.value ?? null
}

export interface RefreshResult {
  skipped?: boolean // auto refresh not due yet
  lastRefreshAt: string | null
  matched:  string[]
  failed:   { symbol: string; error: string }[]
  prices:   number
  fxRates:  number
  constituents: string[] // funds whose constituent file was fetched anew
}

export async function refreshMarketData(opts: { auto?: boolean } = {}): Promise<RefreshResult> {
  await ensurePortfolioSchema()
  const last = await getLastRefresh()
  if (opts.auto && last && Date.now() - Date.parse(last) < AUTO_REFRESH_HOURS * 3_600_000) {
    return { skipped: true, lastRefreshAt: last, matched: [], failed: [], prices: 0, fxRates: 0, constituents: [] }
  }

  const startedAt = new Date().toISOString()
  await prisma.setting.upsert({
    where:  { key: LAST_REFRESH_KEY },
    update: { value: startedAt },
    create: { key: LAST_REFRESH_KEY, value: startedAt },
  })
  const result: RefreshResult = { lastRefreshAt: startedAt, matched: [], failed: [], prices: 0, fxRates: 0, constituents: [] }
  const end = today()

  const first = await prisma.portfolioActivity.findFirst({ orderBy: { date: "asc" }, select: { date: true } })
  if (!first) return result
  const start = minusDays(iso(first.date), 7)

  // 1. Match securities that don't have a listing yet.
  const securities = await prisma.security.findMany()
  for (const sec of securities.filter(s => s.priceSource === "yahoo" && !s.priceSymbol)) {
    const trade = await prisma.portfolioActivity.findFirst({
      where:   { symbol: sec.symbol, type: { in: ["buy", "sell"] }, price: { not: null } },
      orderBy: { date: "asc" },
    })
    if (!trade?.price) continue
    try {
      const match = await matchListing(sec.symbol, {
        date: iso(trade.date), currency: trade.currency, price: trade.price, name: sec.name,
      })
      if (!match) throw new Error("No listing found matching the traded currency and price")
      Object.assign(sec, { priceSymbol: match.symbol, priceCurrency: match.currency, kind: match.kind })
      await prisma.security.update({
        where: { symbol: sec.symbol },
        data:  { priceSymbol: match.symbol, priceCurrency: match.currency, kind: match.kind, lastError: null },
      })
      result.matched.push(`${sec.symbol} → ${match.symbol}`)
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      await prisma.security.update({ where: { symbol: sec.symbol }, data: { lastError: error } })
      result.failed.push({ symbol: sec.symbol, error })
    }
  }

  // 2. Fetch prices from a few days before the last stored close (the latest
  //    close can still change) or from the first activity for new listings.
  for (const sec of securities.filter(s => s.priceSource === "yahoo" && s.priceSymbol)) {
    const latest = await prisma.securityPrice.findFirst({
      where: { symbol: sec.symbol, source: "yahoo" }, orderBy: { date: "desc" },
    })
    const from = latest ? minusDays(latest.date, 4) : start
    try {
      const listing = await fetchListing(sec.priceSymbol!, from, end)
      const manual = new Set((await prisma.securityPrice.findMany({
        where: { symbol: sec.symbol, source: "manual", date: { gte: from } }, select: { date: true },
      })).map(p => p.date))
      const points = listing.points.filter(p => !manual.has(p.date))
      await prisma.$transaction(points.map(p => prisma.securityPrice.upsert({
        where:  { symbol_date: { symbol: sec.symbol, date: p.date } },
        update: { close: p.close },
        create: { symbol: sec.symbol, date: p.date, close: p.close, source: "yahoo" },
      })))
      if (listing.currency !== sec.priceCurrency || listing.kind !== sec.kind || sec.lastError) {
        await prisma.security.update({
          where: { symbol: sec.symbol },
          data:  { priceCurrency: listing.currency, kind: listing.kind ?? sec.kind, lastError: null },
        })
      }
      result.prices += points.length
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      await prisma.security.update({ where: { symbol: sec.symbol }, data: { lastError: error } })
      result.failed.push({ symbol: sec.symbol, error })
    }
  }

  // 3. Exchange rates for every foreign currency in use.
  const currencies = new Set<string>()
  const refreshed = await prisma.security.findMany()
  refreshed.forEach(s => currencies.add(s.priceCurrency ?? s.currency))
  ;(await prisma.portfolioActivity.findMany({ distinct: ["currency"], select: { currency: true } }))
    .forEach(a => currencies.add(a.currency))
  ;(await prisma.portfolioActivity.findMany({
    where: { counterCurrency: { not: null } }, distinct: ["counterCurrency"], select: { counterCurrency: true },
  })).forEach(a => currencies.add(a.counterCurrency!))
  currencies.delete(BASE_CURRENCY)

  for (const currency of currencies) {
    const latest = await prisma.fxRate.findFirst({ where: { currency }, orderBy: { date: "desc" } })
    const from = latest ? minusDays(latest.date, 4) : start
    try {
      const rates = await fetchFxRates(currency, from, end)
      await prisma.$transaction(rates.map(r => prisma.fxRate.upsert({
        where:  { currency_date: { currency, date: r.date } },
        update: { rate: r.close },
        create: { currency, date: r.date, rate: r.close },
      })))
      result.fxRates += rates.length
    } catch (e) {
      result.failed.push({ symbol: currency, error: `Exchange rates: ${e instanceof Error ? e.message : e}` })
    }
  }

  // 4. Constituent files that can be fetched automatically, once they're a week old.
  const due = minusDays(end, CONSTITUENTS_REFETCH_DAYS)
  for (const src of await prisma.fundSource.findMany({ where: { sourceUrl: { not: null }, asOf: { lte: due } } })) {
    try {
      // The original file name carries the fund ISIN, which keeps the auto-fetch URL.
      const file = parseConstituentFile(await fetchConstituentFile(src.sourceUrl!), src.fileName)
      await saveConstituents(src.symbol, file, src.fileName)
      result.constituents.push(src.symbol)
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      await prisma.fundSource.update({ where: { symbol: src.symbol }, data: { lastError: error } })
      result.failed.push({ symbol: src.symbol, error: `Fund holdings: ${error}` })
    }
  }

  return result
}

// ── Look-through (ETF constituents) ─────────────────────────────────────────

const CONSTITUENTS_REFETCH_DAYS = 7
// Weights drift slowly, but a file older than this is worth replacing.
export const CONSTITUENTS_STALE_DAYS = 100

const isFundKind = (kind: string | null) => kind === "ETF" || kind === "MUTUALFUND"

// Replace a fund's constituents with a newly parsed file.
async function saveConstituents(symbol: string, file: ConstituentFile, fileName: string) {
  const sourceUrl = file.provider === "xtrackers" && file.fundIsin ? xtrackersConstituentsUrl(file.fundIsin) : null
  const source = {
    provider: file.provider, asOf: file.asOf, fileName, fundName: file.fundName,
    sourceUrl, lastError: null, importedAt: new Date(),
  }
  await prisma.$transaction([
    prisma.fundConstituent.deleteMany({ where: { symbol } }),
    prisma.fundConstituent.createMany({ data: file.rows.map(r => ({ symbol, ...r })) }),
    prisma.fundSource.upsert({ where: { symbol }, update: source, create: { symbol, ...source } }),
  ])
}

export async function importConstituents(symbol: string, file: ConstituentFile, fileName: string) {
  await ensurePortfolioSchema()
  const sec = await prisma.security.findUnique({ where: { symbol } })
  if (!sec) throw new Error(`Unknown security "${symbol}"`)
  await saveConstituents(symbol, file, fileName)
}

export async function deleteConstituents(symbol: string) {
  await ensurePortfolioSchema()
  await prisma.$transaction([
    prisma.fundConstituent.deleteMany({ where: { symbol } }),
    prisma.fundSource.deleteMany({ where: { symbol } }),
  ])
}

export async function loadLookThrough() {
  const [{ input }, sources, rows] = await Promise.all([
    loadEngineInput(),
    ensurePortfolioSchema().then(() => prisma.fundSource.findMany()),
    ensurePortfolioSchema().then(() => prisma.fundConstituent.findMany()),
  ])
  const portfolio = computePortfolio(input)
  const sourceBySymbol = new Map(sources.map(s => [s.symbol, s]))
  const rowsBySymbol = new Map<string, typeof rows>()
  rows.forEach(r => rowsBySymbol.set(r.symbol, [...(rowsBySymbol.get(r.symbol) ?? []), r]))

  const held = portfolio.holdings.filter(h => h.units > 0)
  const isFund = (h: (typeof held)[number]) => isFundKind(h.kind) || sourceBySymbol.has(h.symbol)
  const result = computeLookThrough(held.map(h => ({
    symbol: h.symbol, name: h.name, value: h.value, isFund: isFund(h), currency: h.priceCurrency,
    constituents: rowsBySymbol.get(h.symbol)?.map(r => ({ ...r, assetClass: r.assetClass as AssetClass })) ?? null,
  })))

  const ageDays = (date: string) => Math.floor((Date.parse(input.today) - Date.parse(date)) / 86_400_000)
  // ~4'000 companies: rounding keeps the response a manageable size.
  const cents = (n: number) => Math.round(n * 100) / 100
  return {
    asOf: portfolio.asOf,
    ...result,
    companies: result.companies.map(c => ({
      ...c, value: cents(c.value), share: Math.round(c.share * 1e6) / 1e6,
      via: c.via.map(v => ({ symbol: v.symbol, value: cents(v.value) })),
    })),
    funds: held.filter(isFund).map(h => {
      const s = sourceBySymbol.get(h.symbol)
      return {
        symbol: h.symbol, name: h.name, value: h.value,
        source: s ? {
          provider: providerLabel(s.provider), asOf: s.asOf, fileName: s.fileName, fundName: s.fundName,
          importedAt: s.importedAt.toISOString(), auto: s.sourceUrl != null, lastError: s.lastError,
          rows: rowsBySymbol.get(h.symbol)?.length ?? 0,
          ageDays: ageDays(s.asOf), stale: ageDays(s.asOf) > CONSTITUENTS_STALE_DAYS,
        } : null,
      }
    }),
  }
}

export type LookThroughSummary = Awaited<ReturnType<typeof loadLookThrough>>

// ── Summary ─────────────────────────────────────────────────────────────────

function group<T>(rows: T[], key: (r: T) => string, point: (r: T) => { date: string; value: number }): Series {
  const m: Series = new Map()
  for (const r of rows) {
    const k = key(r)
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(point(r))
  }
  return m
}

// Everything the engine needs, straight from the database. Pass a symbol to
// load only that security's prices (FX rates are small, so always loaded).
async function loadEngineInput(symbol?: string) {
  await ensurePortfolioSchema()
  const [activities, securities, prices, rates] = await Promise.all([
    prisma.portfolioActivity.findMany({ where: symbol ? { symbol } : {}, orderBy: { date: "asc" } }),
    prisma.security.findMany({ orderBy: { symbol: "asc" } }),
    prisma.securityPrice.findMany({ where: symbol ? { symbol } : {}, orderBy: { date: "asc" } }),
    prisma.fxRate.findMany({ orderBy: { date: "asc" } }),
  ])
  return {
    input: {
      activities: activities.map(a => ({ ...a, date: iso(a.date) })),
      securities,
      prices: group(prices, p => p.symbol, p => ({ date: p.date, value: p.close })),
      fx:     group(rates, r => r.currency, r => ({ date: r.date, value: r.rate })),
      today:  today(),
    },
    activities, securities, prices,
  }
}

export async function loadPortfolio() {
  const [{ input, activities, securities, prices }, lastPrice, lastRefreshAt] = await Promise.all([
    loadEngineInput(),
    ensurePortfolioSchema().then(() =>
      prisma.securityPrice.findFirst({ where: { source: "yahoo" }, orderBy: { date: "desc" } })),
    getLastRefresh(),
  ])
  const result = computePortfolio(input)

  return {
    ...result,
    securities: securities.map(s => ({
      symbol:        s.symbol,
      name:          s.name,
      currency:      s.currency,
      kind:          s.kind,
      priceSource:   s.priceSource,
      priceSymbol:   s.priceSymbol,
      priceCurrency: s.priceCurrency,
      pinned:        s.pinned,
      lastError:     s.lastError,
      priceCount:    prices.filter(p => p.symbol === s.symbol).length,
    })),
    activityCount: activities.length,
    lastPriceDate: lastPrice?.date ?? null,
    lastRefreshAt,
  }
}

export type PortfolioSummary = Awaited<ReturnType<typeof loadPortfolio>>

export async function loadHoldingDetail(symbol: string) {
  const { input, securities } = await loadEngineInput(symbol)
  const detail = computeHoldingDetail(input, symbol)
  if (!detail) return null
  const sec = securities.find(s => s.symbol === symbol)
  return {
    ...detail,
    source: sec ? {
      priceSource: sec.priceSource, priceSymbol: sec.priceSymbol,
      pinned: sec.pinned, lastError: sec.lastError,
    } : null,
  }
}

export type HoldingDetailSummary = NonNullable<Awaited<ReturnType<typeof loadHoldingDetail>>>
