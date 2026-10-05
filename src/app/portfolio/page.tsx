"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ComposedChart, Area, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts"
import { ChevronRight, RefreshCw, Upload } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { PortfolioSummary } from "@/lib/portfolio/store"
import { PriceSources } from "./price-sources"

// ── Formatting ──────────────────────────────────────────────────────────────

const fmtR   = (n: number) => Math.round(n).toLocaleString("de-CH")
const fmt2   = (n: number) => n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtQty = (n: number) => n.toLocaleString("de-CH", { maximumFractionDigits: 4 })
const fmtPct = (n: number | null, signed = true) =>
  n == null ? "—" : `${signed && n > 0 ? "+" : ""}${(n * 100).toFixed(2)}%`
const fmtSigned = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}Fr. ${fmtR(Math.abs(n))}`
const tone = (n: number | null) => n == null || Math.abs(n) < 1e-9 ? "" : n > 0 ? "text-positive" : "text-negative"
const fmtK = (n: number) => Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`
const monthLabel = (m: string) =>
  new Date(m + "-01T00:00:00Z").toLocaleDateString("de-CH", { month: "short", year: "2-digit", timeZone: "UTC" })
const dayLabel = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("de-CH", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" })

const RANGES = { "3M": 91, "6M": 182, "1Y": 365, "All": Infinity } as const
type Range = keyof typeof RANGES
type KindFilter = "all" | "etf" | "stock"

const isEtf = (kind: string | null) => kind === "ETF" || kind === "MUTUALFUND"
const holdingHref = (symbol: string) => `/portfolio/${encodeURIComponent(symbol)}`

// ── Page ────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const [data, setData]       = useState<PortfolioSummary | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [busy, setBusy]       = useState<string | null>(null) // status text while working
  const [notice, setNotice]   = useState<{ text: string; tone: "ok" | "warn" } | null>(null)
  const [range, setRange]     = useState<Range>("All")
  const [kind, setKind]       = useState<KindFilter>("all")
  const fileInput             = useRef<HTMLInputElement>(null)
  const router                = useRouter()
  const autoRefreshed         = useRef(false)

  const load = useCallback(async () => {
    const res = await fetch("/api/portfolio")
    const d = await res.json()
    if (!res.ok) throw new Error(d.error ?? "Failed to load portfolio")
    setData(d)
    return d as PortfolioSummary
  }, [])

  // `auto` lets the server skip the refresh if one ran in the last few hours;
  // it runs silently in the background. Manual refreshes always run.
  const refresh = useCallback(async ({ quiet = false, auto = false } = {}) => {
    if (!auto) setBusy("Updating prices…")
    try {
      const res = await fetch(`/api/portfolio/refresh${auto ? "?auto=1" : ""}`, { method: "POST" })
      const r = await res.json()
      if (!res.ok) throw new Error(r.error ?? "Refresh failed")
      if (r.skipped) return
      await load()
      if (r.failed?.length) {
        const failed: { symbol: string; error: string }[] = r.failed
        const limited = failed.find(f => /limiting requests/.test(f.error))
        setNotice({ tone: "warn", text: limited
          ? `${limited.error}. Showing the last saved prices.`
          : `Some prices couldn't be updated: ${failed.map(f => f.symbol).join(", ")}. See Price sources below.` })
      } else if (!quiet) {
        setNotice({ tone: "ok", text: r.matched?.length ? `Prices updated. Matched ${r.matched.join(", ")}.` : "Prices updated." })
      }
    } catch (e) {
      setNotice({ tone: "warn", text: `Couldn't reach the price service — showing the last saved prices. (${e instanceof Error ? e.message : e})` })
    } finally {
      setBusy(null)
    }
  }, [load])

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
    setBusy("Importing…")
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/portfolio/import", { method: "POST", body: form })
      const r = await res.json()
      if (!res.ok) throw new Error(r.error ?? "Import failed")
      await refresh({ quiet: true })
      const extra = [
        r.skipped  ? `${r.skipped} already imported` : "",
        r.rejected ? `${r.rejected} rejected orders ignored` : "",
        r.unknown?.length ? `unrecognised: ${r.unknown.join(", ")}` : "",
      ].filter(Boolean).join(" · ")
      setNotice({ tone: r.unknown?.length ? "warn" : "ok", text: `Imported ${r.imported} activities${extra ? ` (${extra})` : ""}.` })
    } catch (e) {
      setNotice({ tone: "warn", text: e instanceof Error ? e.message : "Import failed" })
    } finally {
      setBusy(null)
      if (fileInput.current) fileInput.current.value = ""
    }
  }

  async function deleteAll() {
    if (!confirm("Delete all portfolio data? Imported activities, price sources and cached prices are removed. Your bank data is not affected.")) return
    setBusy("Deleting…")
    try {
      const res = await fetch("/api/portfolio", { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error ?? "Delete failed")
      await load()
      setNotice({ tone: "ok", text: "Portfolio data deleted." })
    } catch (e) {
      setNotice({ tone: "warn", text: e instanceof Error ? e.message : "Delete failed" })
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
  const t = data?.totals

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-widest uppercase text-muted-foreground mb-2">Portfolio</p>
          <h1 className="text-3xl font-semibold tracking-tight">Investments</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Performance, dividends and holdings from your Yuh exports, valued at daily market prices.
            {data?.lastPriceDate && <> Prices as of {dayLabel(data.lastPriceDate)}</>}
            {data?.lastRefreshAt && <>, checked {new Date(data.lastRefreshAt).toLocaleString("de-CH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</>}
            {data?.lastPriceDate && "."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInput} type="file" accept=".csv,text/csv" className="hidden"
            onChange={e => e.target.files?.[0] && importFile(e.target.files[0])}
          />
          {!!data?.activityCount && (
            <Button variant="outline" onClick={() => refresh()} disabled={!!busy}>
              <RefreshCw className={busy === "Updating prices…" ? "animate-spin" : ""} />
              Refresh prices
            </Button>
          )}
          <Button onClick={() => fileInput.current?.click()} disabled={!!busy}>
            <Upload />
            Import Yuh CSV
          </Button>
        </div>
      </div>

      {(busy || notice) && (
        <div className={`mb-4 rounded-lg border px-4 py-2.5 text-sm ${
          busy ? "border-border text-muted-foreground"
            : notice?.tone === "ok" ? "border-positive/30 bg-positive/10"
            : "border-highlight/40 bg-highlight/10"
        }`}>
          {busy ?? notice?.text}
        </div>
      )}

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !data ? (
        <div className="flex items-center gap-3 text-sm text-muted-foreground py-20 justify-center">
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Loading...
        </div>
      ) : data.activityCount === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <p className="font-medium">No investments imported yet</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Export your activities from Yuh as a CSV file and import it here. Holdings are matched to
              market prices automatically. Import newer exports any time — activities already imported are skipped.
            </p>
            <Button onClick={() => fileInput.current?.click()} disabled={!!busy}>
              <Upload />
              Import Yuh CSV
            </Button>
          </CardContent>
        </Card>
      ) : t && (
        <div className="space-y-4">
          {data.warnings.length > 0 && (
            <ul className="rounded-lg border border-highlight/40 bg-highlight/10 px-4 py-2.5 text-sm space-y-0.5">
              {data.warnings.map(w => <li key={w}>{w}</li>)}
            </ul>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Value">
              <p className="text-2xl font-semibold">Fr. {fmtR(t.value)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Securities {fmtR(t.securities)} · Cash {fmtR(t.cash)}
              </p>
            </Stat>
            <Stat label="Gain vs. deposits">
              <p className={`text-2xl font-semibold ${tone(t.gain)}`}>{fmtSigned(t.gain)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                <span className={tone(t.gainPct)}>{fmtPct(t.gainPct)}</span> on Fr. {fmtR(t.netDeposits)} deposited
              </p>
            </Stat>
            <Stat label="Dividends received">
              <p className="text-2xl font-semibold text-info">Fr. {fmt2(t.dividends)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                net · Fr. {fmt2(t.withholdingTax)} withholding tax
              </p>
            </Stat>
            <Stat label="Return">
              <p className={`text-2xl font-semibold ${tone(t.twr)}`}>{fmtPct(t.twrAnnualized ?? t.twr)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                time-weighted{t.twrAnnualized != null ? " p.a." : ` since ${data.start ? dayLabel(data.start) : "start"}`}
                {" · "}money-weighted <span className={tone(t.irr)}>{fmtPct(t.irr)}</span> p.a.
              </p>
            </Stat>
          </div>

          {/* Value over time */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Value over time</CardTitle>
              <Tabs value={range} onValueChange={v => setRange(v as Range)}>
                <TabsList>
                  {(Object.keys(RANGES) as Range[]).map(r => <TabsTrigger key={r} value={r}>{r}</TabsTrigger>)}
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
                    formatter={(v, name) => [`Fr. ${fmtR(Number(v))}`, name === "value" ? "Value" : "Deposited"]}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={2} fill="url(#grad-value)" />
                  <Line type="stepAfter" dataKey="invested" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 justify-center text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-chart-1" /> Value</span>
                <span className="flex items-center gap-1.5"><span className="w-3 border-t border-dashed border-muted-foreground" /> Net deposits</span>
              </div>
            </CardContent>
          </Card>

          {/* Holdings */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Holdings</CardTitle>
              {hasStocks && (
                <Tabs value={kind} onValueChange={v => setKind(v as KindFilter)}>
                  <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="etf">ETFs</TabsTrigger>
                    <TabsTrigger value="stock">Stocks</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Holding</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Avg. cost</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">Gain</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead className="w-6"><span className="sr-only">Details</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holdings.map(h => (
                    <TableRow key={h.symbol} className="cursor-pointer" onClick={() => router.push(holdingHref(h.symbol))}>
                      <TableCell className="max-w-64">
                        <div className="flex items-center gap-2">
                          <Link href={holdingHref(h.symbol)} className="font-mono text-xs font-medium hover:underline" onClick={e => e.stopPropagation()}>
                            {h.symbol}
                          </Link>
                          {h.kind && <Badge variant="outline" className="text-[10px]">{isEtf(h.kind) ? "ETF" : "Stock"}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{h.name}</p>
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmtQty(h.units)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt2(h.avgCost)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {h.price != null ? `${fmt2(h.price)} ${h.priceCurrency}` : "—"}
                        {h.priceIsTrade && <p className="text-[10px] text-highlight">last trade price</p>}
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
                Click a holding for its price history, trades and returns. Amounts in CHF; cost includes fees. Realised from sales: <span className={tone(t.realizedGain)}>{fmtSigned(t.realizedGain)}</span>
                {" · "}Trading &amp; exchange fees paid: Fr. {fmt2(t.fees)}
              </p>
            </CardContent>
          </Card>

          {/* Dividends */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Dividends</CardTitle>
            </CardHeader>
            <CardContent>
              {data.dividends.length === 0 ? (
                <p className="text-sm text-muted-foreground">No dividends received yet.</p>
              ) : (
                <div className="grid gap-6 lg:grid-cols-2">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.dividends} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                      <YAxis width={36} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        labelFormatter={l => monthLabel(String(l))}
                        formatter={(v, name) => [`Fr. ${fmt2(Number(v))}`, name === "net" ? "Received (net)" : "Withholding tax"]}
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
                        <TableHead>Holding</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Last 12 mo.</TableHead>
                        <TableHead className="text-right">Yield on cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.holdings.filter(h => h.dividends > 0).sort((a, b) => b.dividends - a.dividends).map(h => (
                        <TableRow key={h.symbol}>
                          <TableCell className="font-mono text-xs font-medium">
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
              Time-weighted return measures the investments themselves, ignoring when you deposited.
              Money-weighted return (IRR) is your personal return including timing; annualising it over
              less than a year can exaggerate it. Prices: Yahoo Finance · Exchange rates: European Central Bank.
            </p>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={deleteAll} disabled={!!busy}>
              Delete portfolio data
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
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{label}</p>
        {children}
      </CardContent>
    </Card>
  )
}
