"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ComposedChart, Area, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts"
import { ChevronRight, Layers, RefreshCw, Upload } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { PortfolioSummary } from "@/lib/portfolio/store"
import { PriceSources } from "./price-sources"
import { Allocation } from "./allocation"
import { PageLoading } from "@/components/page-loading"
import { useT } from "@/lib/i18n/provider"
import { warningText } from "@/lib/i18n/labels"
import type { MessageKey } from "@/locales"

// ── Formatting ──────────────────────────────────────────────────────────────

const tone = (n: number | null) => n == null || Math.abs(n) < 1e-9 ? "" : n > 0 ? "text-positive" : "text-negative"
const fmtK = (n: number) => Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`

// Number and date writing in the current language.
function useFormats() {
  const { f, locale } = useT()
  const fmtR = f.int
  return {
    fmtR,
    fmt2: (n: number) => f.decimal(n),
    fmtQty: (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 4 }),
    fmtPct: (n: number | null, signed = true) =>
      n == null ? "—" : `${signed && n > 0 ? "+" : ""}${(n * 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`,
    fmtSigned: (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}Fr. ${fmtR(Math.abs(n))}`,
    monthLabel: (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString(locale, { month: "short", year: "2-digit", timeZone: "UTC" }),
    dayLabel: (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString(locale, { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" }),
  }
}

const RANGES = { "3M": 91, "6M": 182, "1Y": 365, "All": Infinity } as const
const RANGE_LABEL: Record<keyof typeof RANGES, MessageKey> = {
  "3M": "pf.range.3M", "6M": "pf.range.6M", "1Y": "pf.range.1Y", "All": "pf.range.All",
}
type Range = keyof typeof RANGES
type KindFilter = "all" | "etf" | "stock"

const isEtf = (kind: string | null) => kind === "ETF" || kind === "MUTUALFUND"
const holdingHref = (symbol: string) => `/portfolio/${encodeURIComponent(symbol)}`

// ── Page ────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { t, rich, locale } = useT()
  const { fmtR, fmt2, fmtQty, fmtPct, fmtSigned, monthLabel, dayLabel } = useFormats()
  const [data, setData]       = useState<PortfolioSummary | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [busy, setBusy]       = useState<MessageKey | null>(null) // what's being done, shown while working
  const [notice, setNotice]   = useState<{ text: string; tone: "ok" | "warn" } | null>(null)
  const [range, setRange]     = useState<Range>("All")
  const [kind, setKind]       = useState<KindFilter>("all")
  const fileInput             = useRef<HTMLInputElement>(null)
  const router                = useRouter()
  const autoRefreshed         = useRef(false)

  const load = useCallback(async () => {
    const res = await fetch("/api/portfolio")
    const d = await res.json()
    if (!res.ok) throw new Error(d.error ?? t("pf.loadFailed"))
    setData(d)
    return d as PortfolioSummary
  }, [t])

  // `auto` lets the server skip the refresh if one ran in the last few hours;
  // it runs silently in the background. Manual refreshes always run.
  const refresh = useCallback(async ({ quiet = false, auto = false } = {}) => {
    if (!auto) setBusy("pf.busy.prices")
    try {
      const res = await fetch(`/api/portfolio/refresh${auto ? "?auto=1" : ""}`, { method: "POST" })
      const r = await res.json()
      if (!res.ok) throw new Error(r.error ?? t("pf.refreshFailed"))
      if (r.skipped) return
      await load()
      if (r.failed?.length) {
        const failed: { symbol: string; error: string }[] = r.failed
        const limited = failed.find(f => /limiting requests/.test(f.error))
        setNotice({ tone: "warn", text: limited
          ? t("pf.rateLimited", { error: limited.error })
          : t("pf.someFailed", { symbols: failed.map(f => f.symbol).join(", ") }) })
      } else if (!quiet) {
        setNotice({ tone: "ok", text: r.matched?.length ? t("pf.updatedMatched", { symbols: r.matched.join(", ") }) : t("pf.updated") })
      }
    } catch (e) {
      setNotice({ tone: "warn", text: t("pf.unreachable", { error: e instanceof Error ? e.message : String(e) }) })
    } finally {
      setBusy(null)
    }
  }, [load, t])

  // Load, then ask for a background top-up; the server skips it if prices were
  // checked recently, so frequent visits don't hammer the price service.
  useEffect(() => {
    load()
      .then(d => {
        if (d.activityCount > 0 && !autoRefreshed.current) {
          autoRefreshed.current = true
          refresh({ quiet: true, auto: true })
        }
      })
      .catch(e => setError(e.message))
  }, [load, refresh])

  async function importFile(file: File) {
    setNotice(null)
    setBusy("pf.busy.importing")
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/portfolio/import", { method: "POST", body: form })
      const r = await res.json()
      if (!res.ok) throw new Error(r.error ?? t("pf.importFailed"))
      await refresh({ quiet: true })
      const extra = [
        r.skipped  ? t("pf.alreadyImported", { count: r.skipped }) : "",
        r.rejected ? t("import.rejected", { count: r.rejected }) : "",
        r.unknown?.length ? t("pf.unrecognised", { types: r.unknown.join(", ") }) : "",
      ].filter(Boolean).join(" · ")
      setNotice({ tone: r.unknown?.length ? "warn" : "ok", text: extra ? t("pf.importedExtra", { count: r.imported, extra }) : t("pf.imported", { count: r.imported }) })
    } catch (e) {
      setNotice({ tone: "warn", text: e instanceof Error ? e.message : t("pf.importFailed") })
    } finally {
      setBusy(null)
      if (fileInput.current) fileInput.current.value = ""
    }
  }

  async function deleteAll() {
    if (!confirm(t("pf.deleteConfirm"))) return
    setBusy("pf.busy.deleting")
    try {
      const res = await fetch("/api/portfolio", { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error ?? t("pf.deleteFailed"))
      await load()
      setNotice({ tone: "ok", text: t("pf.deleted") })
    } catch (e) {
      setNotice({ tone: "warn", text: e instanceof Error ? e.message : t("pf.deleteFailed") })
    } finally {
      setBusy(null)
    }
  }

  const series = useMemo(() => {
    if (!data) return []
    const days = RANGES[range]
    if (!Number.isFinite(days)) return data.series
    // Measured back from the latest data point, keeping render pure.
    const end = data.series.at(-1)?.date
    if (!end) return data.series
    const cutoff = new Date(Date.parse(end) - days * 86_400_000).toISOString().slice(0, 10)
    return data.series.filter(p => p.date >= cutoff)
  }, [data, range])

  const holdings = useMemo(() => (data?.holdings ?? [])
    .filter(h => h.units > 0)
    .filter(h => kind === "all" || (kind === "etf" ? isEtf(h.kind) : !isEtf(h.kind))), [data, kind])

  const hasStocks = data?.holdings.some(h => h.units > 0 && !isEtf(h.kind))
  const tot = data?.totals

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase text-muted-foreground mb-2">{t("nav.page.portfolio")}</p>
          <h1>{t("pf.title")}</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {t("pf.intro")}
            {data?.lastPriceDate && (data.lastRefreshAt
              ? <> {t("pf.pricesChecked", { date: dayLabel(data.lastPriceDate), time: new Date(data.lastRefreshAt).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}</>
              : <> {t("pf.pricesAsOf", { date: dayLabel(data.lastPriceDate) })}</>)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInput} type="file" accept=".csv,text/csv" className="hidden"
            onChange={e => e.target.files?.[0] && importFile(e.target.files[0])}
          />
          {!!data?.activityCount && (
            <Button variant="outline" asChild>
              <Link href="/portfolio/look-through"><Layers /> {t("pf.lookThrough")}</Link>
            </Button>
          )}
          {!!data?.activityCount && (
            <Button variant="outline" onClick={() => refresh()} disabled={!!busy}>
              <RefreshCw className={busy === "pf.busy.prices" ? "animate-spin" : ""} />
              {t("pf.refresh")}
            </Button>
          )}
          <Button onClick={() => fileInput.current?.click()} disabled={!!busy}>
            <Upload />
            {t("pf.importCsv")}
          </Button>
        </div>
      </div>

      {(busy || notice) && (
        <div className={`mb-4 rounded-lg border px-4 py-2.5 text-sm ${
          busy ? "border-border text-muted-foreground"
            : notice?.tone === "ok" ? "border-positive/30 bg-positive/10"
            : "border-highlight/40 bg-highlight/10"
        }`}>
          {busy ? t(busy) : notice?.text}
        </div>
      )}

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !data ? (
        <PageLoading />
      ) : data.activityCount === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <p>{t("pf.empty.title")}</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {t("pf.empty.text")}
            </p>
            <Button onClick={() => fileInput.current?.click()} disabled={!!busy}>
              <Upload />
              {t("pf.importCsv")}
            </Button>
          </CardContent>
        </Card>
      ) : tot && (
        <div className="space-y-4">
          {data.warnings.length > 0 && (
            <ul className="rounded-lg border border-highlight/40 bg-highlight/10 px-4 py-2.5 text-sm space-y-0.5">
              {data.warnings.map(w => <li key={JSON.stringify(w)}>{warningText(t, w)}</li>)}
            </ul>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t("pf.stat.value")}>
              <p className="font-display text-3xl">Fr. {fmtR(tot.value)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("pf.stat.valueSub", { securities: fmtR(tot.securities), cash: fmtR(tot.cash) })}
              </p>
            </Stat>
            <Stat label={t("pf.stat.gain")}>
              <p className={`font-display text-3xl ${tone(tot.gain)}`}>{fmtSigned(tot.gain)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {rich("pf.stat.gainSub", { c: text => <span className={tone(tot.gainPct)}>{text}</span> }, { pct: fmtPct(tot.gainPct), deposited: fmtR(tot.netDeposits) })}
              </p>
            </Stat>
            <Stat label={t("pf.stat.dividends")}>
              <p className="font-display text-3xl text-info">Fr. {fmt2(tot.dividends)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("pf.stat.dividendsSub", { tax: fmt2(tot.withholdingTax) })}
              </p>
            </Stat>
            <Stat label={t("pf.stat.return")}>
              <p className={`font-display text-3xl ${tone(tot.twr)}`}>{fmtPct(tot.twrAnnualized ?? tot.twr)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {tot.twrAnnualized != null
                  ? rich("pf.stat.returnAnnual", { c: text => <span className={tone(tot.irr)}>{text}</span> }, { irr: fmtPct(tot.irr) })
                  : rich("pf.stat.returnSince", { c: text => <span className={tone(tot.irr)}>{text}</span> }, { date: data.start ? dayLabel(data.start) : t("pf.stat.start"), irr: fmtPct(tot.irr) })}
              </p>
            </Stat>
          </div>

          {/* Value over time */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm text-muted-foreground">{t("pf.chart.title")}</CardTitle>
              <Tabs value={range} onValueChange={v => setRange(v as Range)}>
                <TabsList>
                  {(Object.keys(RANGES) as Range[]).map(r => <TabsTrigger key={r} value={r}>{t(RANGE_LABEL[r])}</TabsTrigger>)}
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={series} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="grad-value" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date" tickFormatter={dayLabel} minTickGap={48}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tickFormatter={fmtK} width={44} domain={["auto", "auto"]}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false}
                  />
                  <Tooltip
                    labelFormatter={l => dayLabel(String(l))}
                    formatter={(v, name) => [`Fr. ${fmtR(Number(v))}`, name === "value" ? t("pf.chart.value") : t("pf.chart.deposited")]}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={2} fill="url(#grad-value)" />
                  <Line type="stepAfter" dataKey="invested" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 justify-center text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-chart-1" /> {t("pf.chart.value")}</span>
                <span className="flex items-center gap-1.5"><span className="w-3 border-t border-dashed border-muted-foreground" /> {t("pf.chart.netDeposits")}</span>
              </div>
            </CardContent>
          </Card>

          {/* Holdings */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm text-muted-foreground">{t("pf.holdings.title")}</CardTitle>
              {hasStocks && (
                <Tabs value={kind} onValueChange={v => setKind(v as KindFilter)}>
                  <TabsList>
                    <TabsTrigger value="all">{t("pf.holdings.all")}</TabsTrigger>
                    <TabsTrigger value="etf">{t("pf.holdings.etfs")}</TabsTrigger>
                    <TabsTrigger value="stock">{t("pf.holdings.stocks")}</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("pf.holdings.holding")}</TableHead>
                    <TableHead className="text-right">{t("pf.holdings.units")}</TableHead>
                    <TableHead className="text-right">{t("pf.holdings.avgCost")}</TableHead>
                    <TableHead className="text-right">{t("pf.holdings.price")}</TableHead>
                    <TableHead className="text-right">{t("pf.holdings.value")}</TableHead>
                    <TableHead className="text-right">{t("pf.holdings.gain")}</TableHead>
                    <TableHead className="text-right">{t("pf.holdings.weight")}</TableHead>
                    <TableHead className="w-6"><span className="sr-only">{t("pf.holdings.details")}</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holdings.map(h => (
                    <TableRow key={h.symbol} className="cursor-pointer" onClick={() => router.push(holdingHref(h.symbol))}>
                      <TableCell className="max-w-64">
                        <div className="flex items-center gap-2">
                          <Link href={holdingHref(h.symbol)} className="font-mono text-xs hover:underline" onClick={e => e.stopPropagation()}>
                            {h.symbol}
                          </Link>
                          {h.kind && <Badge variant="outline" className="text-[10px]">{isEtf(h.kind) ? t("pf.kind.etf") : t("pf.kind.stock")}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{h.name}</p>
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmtQty(h.units)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt2(h.avgCost)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {h.price != null ? `${fmt2(h.price)} ${h.priceCurrency}` : "—"}
                        {h.priceIsTrade && <p className="text-[10px] text-highlight">{t("pf.holdings.lastTrade")}</p>}
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmtR(h.value)}</TableCell>
                      <TableCell className={`text-right font-mono ${tone(h.gain)}`}>
                        {fmtSigned(h.gain)}
                        <p className="text-[10px]">{fmtPct(h.gainPct)}</p>
                      </TableCell>
                      <TableCell className="text-right font-mono">{(h.weight * 100).toFixed(1)}%</TableCell>
                      <TableCell className="text-muted-foreground"><ChevronRight className="size-4" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground mt-3">
                {rich("pf.holdings.note", { c: text => <span className={tone(tot.realizedGain)}>{text}</span> }, { realised: fmtSigned(tot.realizedGain), fees: fmt2(tot.fees) })}
              </p>
            </CardContent>
          </Card>

          <Allocation data={data} onSaved={load} />

          {/* Dividends */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{t("pf.dividends.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.dividends.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("pf.dividends.none")}</p>
              ) : (
                <div className="grid gap-6 lg:grid-cols-2">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.dividends} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                      <YAxis width={36} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        labelFormatter={l => monthLabel(String(l))}
                        formatter={(v, name) => [`Fr. ${fmt2(Number(v))}`, name === "net" ? t("pf.dividends.received") : t("pf.dividends.withholding")]}
                        contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                        cursor={{ fill: "var(--muted)" }}
                      />
                      <Bar dataKey="net" stackId="d" fill="var(--chart-2)" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="tax" stackId="d" fill="var(--chart-2)" fillOpacity={0.35} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("pf.holdings.holding")}</TableHead>
                        <TableHead className="text-right">{t("pf.dividends.total")}</TableHead>
                        <TableHead className="text-right">{t("pf.dividends.last12")}</TableHead>
                        <TableHead className="text-right">{t("pf.dividends.yield")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.holdings.filter(h => h.dividends > 0).sort((a, b) => b.dividends - a.dividends).map(h => (
                        <TableRow key={h.symbol}>
                          <TableCell className="font-mono text-xs">
                            <Link href={holdingHref(h.symbol)} className="hover:underline">{h.symbol}</Link>
                          </TableCell>
                          <TableCell className="text-right font-mono">{fmt2(h.dividends)}</TableCell>
                          <TableCell className="text-right font-mono">{fmt2(h.dividendsTtm)}</TableCell>
                          <TableCell className="text-right font-mono">{fmtPct(h.yieldOnCost, false)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <PriceSources
            securities={data.securities}
            onChanged={async ({ refresh: fetchPrices } = {}) => { if (fetchPrices) await refresh(); else await load() }}
          />

          {/* Footnotes + delete */}
          <div className="flex flex-wrap items-start justify-between gap-4 pb-4">
            <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
              {t("pf.footnote")}
            </p>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={deleteAll} disabled={!!busy}>
              {t("pf.deleteButton")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="text-xs uppercase text-muted-foreground mb-2">{label}</p>
        {children}
      </CardContent>
    </Card>
  )
}
