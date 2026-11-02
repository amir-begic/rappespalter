"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ComposedChart, Area, Line, Scatter, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts"
import { ArrowLeft } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { HoldingDetailSummary } from "@/lib/portfolio/store"
import { PageLoading } from "@/components/page-loading"
import { useT } from "@/lib/i18n/provider"
import { warningText } from "@/lib/i18n/labels"
import type { MessageKey } from "@/locales"

const tone = (n: number | null) => n == null || Math.abs(n) < 1e-9 ? "" : n > 0 ? "text-positive" : "text-negative"

// Number and date writing in the current language.
function useFormats() {
  const { f, locale } = useT()
  const fmt2 = (n: number) => f.decimal(n)
  return {
    fmtR: f.int,
    fmt2,
    fmtQty: (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 4 }),
    fmtPct: (n: number | null) => n == null ? "—" : `${n > 0 ? "+" : ""}${(n * 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`,
    fmtSigned: (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}Fr. ${fmt2(Math.abs(n))}`,
    dayLabel: (d: string) => f.date(d + "T00:00:00Z", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" }),
  }
}

const RANGES = { "3M": 91, "6M": 182, "1Y": 365, "All": Infinity } as const
const RANGE_LABEL: Record<keyof typeof RANGES, MessageKey> = {
  "3M": "pf.range.3M", "6M": "pf.range.6M", "1Y": "pf.range.1Y", "All": "pf.range.All",
}
type Range = keyof typeof RANGES
type View = "price" | "position"

const SERIES_LABELS: Record<string, MessageKey> = {
  price: "pos.series.price", avgCost: "pos.series.avgCost", buy: "pos.series.buy", sell: "pos.series.sell",
  value: "pos.series.value", cost: "pos.series.cost",
}

export default function HoldingPage() {
  const { t, rich } = useT()
  const { fmtR, fmt2, fmtQty, fmtPct, fmtSigned, dayLabel } = useFormats()
  const { symbol } = useParams<{ symbol: string }>()
  const [data, setData]   = useState<HoldingDetailSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<Range>("All")
  const [view, setView]   = useState<View>("price")

  useEffect(() => {
    fetch(`/api/portfolio/holdings/${encodeURIComponent(symbol)}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? t("pos.loadFailed"))
        setData(d)
      })
      .catch(e => setError(e.message))
    // Reloads per holding; t is only read if loading fails.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol])

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

  const s = data?.stats
  const ccy = data?.priceCurrency ?? ""

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <Link href="/portfolio" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="size-4" /> {t("nav.page.portfolio")}
      </Link>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !data || !s ? (
        <PageLoading />
      ) : (
        <div className="space-y-4">
          {/* Header */}
          <div className="mb-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="font-mono text-xs uppercase text-muted-foreground">{data.symbol}</span>
              {data.kind && <Badge variant="outline">{data.kind === "ETF" || data.kind === "MUTUALFUND" ? t("pf.kind.etf") : t("pf.kind.stock")}</Badge>}
              {data.source?.priceSource === "manual"
                ? <Badge variant="secondary">{t("pf.src.manual")}</Badge>
                : data.source?.priceSymbol && <Badge variant="outline">{t("pos.pricedFrom", { symbol: data.source.priceSymbol })}</Badge>}
              {s.units === 0 && <Badge variant="secondary">{t("pos.closed")}</Badge>}
            </div>
            <h1>{data.name}</h1>
            {s.price != null && (
              <p className="text-sm text-muted-foreground mt-2">
                <span className="font-mono text-foreground">{fmt2(s.price)} {ccy}</span>
                {s.priceDate && <> · {t(s.priceIsTrade ? "pos.lastTradeOn" : "pos.closeOn", { date: dayLabel(s.priceDate) })}</>}
                {s.priceChangeSinceFirstBuy != null && (
                  <> · {rich("pos.sinceFirstBuy", { c: text => <span className={tone(s.priceChangeSinceFirstBuy)}>{text}</span> }, { pct: fmtPct(s.priceChangeSinceFirstBuy) })}</>
                )}
              </p>
            )}
          </div>

          {data.warnings.length > 0 && (
            <ul className="rounded-lg border border-highlight/40 bg-highlight/10 px-4 py-2.5 text-sm space-y-0.5">
              {data.warnings.map(w => <li key={JSON.stringify(w)}>{warningText(t, w)}</li>)}
            </ul>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t("pos.stat.position")}>
              <p className="font-display text-3xl">Fr. {fmtR(s.value)}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("pos.stat.units", { count: s.units, units: fmtQty(s.units) })}</p>
            </Stat>
            <Stat label={t("pos.stat.avgCost")}>
              <p className="font-display text-3xl">{s.avgCost != null ? `${fmt2(s.avgCost)} ${ccy}` : "—"}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {s.avgCostChf != null && ccy !== "CHF" ? t("pos.stat.avgCostSubChf", { chf: fmt2(s.avgCostChf) }) : t("pos.stat.avgCostSub")}
              </p>
            </Stat>
            <Stat label={t("pos.stat.unrealised")}>
              <p className={`font-display text-3xl ${tone(s.unrealized)}`}>{fmtSigned(s.unrealized)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {rich("pos.stat.unrealisedSub", { c: text => <span className={tone(s.unrealizedPct)}>{text}</span> }, { pct: fmtPct(s.unrealizedPct), cost: fmtR(s.costBasis) })}
              </p>
            </Stat>
            <Stat label={t("pos.stat.totalReturn")}>
              <p className={`font-display text-3xl ${tone(s.totalReturn)}`}>{fmtSigned(s.totalReturn)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {rich("pos.stat.totalReturnSub", { c: text => <span className={tone(s.totalReturnPct)}>{text}</span> }, { pct: fmtPct(s.totalReturnPct), bought: fmtR(s.totalBought) })}
              </p>
            </Stat>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("pos.totalNote", { unrealised: fmtSigned(s.unrealized), realised: fmtSigned(s.realized), dividends: fmtSigned(s.dividends), fees: fmt2(s.fees) })}
          </p>

          {/* Chart */}
          <Card>
            <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2">
              <Tabs value={view} onValueChange={v => setView(v as View)}>
                <TabsList>
                  <TabsTrigger value="price">{t("pos.tab.priceTrades")}</TabsTrigger>
                  <TabsTrigger value="position">{t("pos.tab.positionValue")}</TabsTrigger>
                </TabsList>
              </Tabs>
              <Tabs value={range} onValueChange={v => setRange(v as Range)}>
                <TabsList>
                  {(Object.keys(RANGES) as Range[]).map(r => <TabsTrigger key={r} value={r}>{t(RANGE_LABEL[r])}</TabsTrigger>)}
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={series} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="grad-position" x1="0" y1="0" x2="0" y2="1">
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
                    width={52} domain={["auto", "auto"]}
                    tickFormatter={v => view === "price" ? fmt2(Number(v)) : fmtR(Number(v))}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false}
                  />
                  <Tooltip
                    labelFormatter={l => dayLabel(String(l))}
                    formatter={(v, name) => [
                      view === "price" ? `${fmt2(Number(v))} ${ccy}` : `Fr. ${fmtR(Number(v))}`,
                      String(name) in SERIES_LABELS ? t(SERIES_LABELS[String(name)]) : name,
                    ]}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  />
                  {view === "price" ? (
                    <>
                      <Line type="monotone" dataKey="price" stroke="var(--chart-1)" strokeWidth={2} dot={false} connectNulls />
                      <Line type="stepAfter" dataKey="avgCost" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                      <Scatter dataKey="buy" fill="var(--positive)" />
                      <Scatter dataKey="sell" fill="var(--negative)" />
                    </>
                  ) : (
                    <>
                      <Area type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={2} fill="url(#grad-position)" />
                      <Line type="stepAfter" dataKey="cost" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-4 mt-2 justify-center text-xs text-muted-foreground">
                {view === "price" ? (
                  <>
                    <Legend line>{t("pos.legend.price", { currency: ccy })}</Legend>
                    <Legend dashed>{t("pos.series.avgCost")}</Legend>
                    <Legend dot="var(--positive)">{t("pos.legend.buy")}</Legend>
                    {data.trades.some(tr => tr.type === "sell") && <Legend dot="var(--negative)">{t("pos.legend.sell")}</Legend>}
                  </>
                ) : (
                  <>
                    <Legend line>{t("pos.legend.valueChf")}</Legend>
                    <Legend dashed>{t("pos.series.cost")}</Legend>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Trades */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{t("pos.trades.title")}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("dashboard.drill.date")}</TableHead>
                    <TableHead>{t("pos.trades.type")}</TableHead>
                    <TableHead className="text-right">{t("pf.holdings.units")}</TableHead>
                    <TableHead className="text-right">{t("pf.holdings.price")}</TableHead>
                    <TableHead className="text-right">{t("pos.trades.amount")}</TableHead>
                    <TableHead className="text-right">{t("pos.trades.fee")}</TableHead>
                    <TableHead className="text-right">{t("pos.trades.vsToday")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...data.trades].reverse().map((tr, i) => {
                    const vsToday = s.price != null && tr.priceQuoted ? s.price / tr.priceQuoted - 1 : null
                    return (
                      <TableRow key={`${tr.date}-${i}`}>
                        <TableCell className="whitespace-nowrap">{dayLabel(tr.date)}</TableCell>
                        <TableCell>
                          <span className={tr.type === "buy" ? "text-positive" : "text-negative"}>
                            {tr.type === "buy" ? t("pos.legend.buy") : t("pos.legend.sell")}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono">{fmtQty(tr.quantity)}</TableCell>
                        <TableCell className="text-right font-mono whitespace-nowrap">{fmt2(tr.price)} {tr.currency}</TableCell>
                        <TableCell className="text-right font-mono whitespace-nowrap">{fmt2(Math.abs(tr.amount))} {tr.currency}</TableCell>
                        <TableCell className="text-right font-mono">{fmt2(tr.fee)}</TableCell>
                        <TableCell className={`text-right font-mono ${tr.type === "buy" ? tone(vsToday) : ""}`}>
                          {tr.type === "buy" ? fmtPct(vsToday) : "—"}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground mt-3">
                {t("pos.trades.note")}
              </p>
            </CardContent>
          </Card>

          {/* Dividends */}
          {data.dividends.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t("pf.dividends.title")}</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("dashboard.drill.date")}</TableHead>
                      <TableHead className="text-right">{t("pos.div.received")}</TableHead>
                      <TableHead className="text-right">{t("pf.dividends.withholding")}</TableHead>
                      <TableHead className="text-right">{t("pos.div.inChf")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...data.dividends].reverse().map((d, i) => (
                      <TableRow key={`${d.date}-${i}`}>
                        <TableCell className="whitespace-nowrap">{dayLabel(d.date)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt2(d.amount)} {d.currency}</TableCell>
                        <TableCell className="text-right font-mono">{fmt2(d.tax)} {d.currency}</TableCell>
                        <TableCell className="text-right font-mono">{fmt2(d.chf)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="text-xs text-muted-foreground mt-3">
                  {t("pos.div.total", { amount: fmt2(s.dividends), tax: fmt2(s.withholdingTax) })}
                </p>
              </CardContent>
            </Card>
          )}
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

function Legend({ children, line, dashed, dot }: {
  children: React.ReactNode; line?: boolean; dashed?: boolean; dot?: string
}) {
  return (
    <span className="flex items-center gap-1.5">
      {line && <span className="w-3 h-0.5 bg-chart-1" />}
      {dashed && <span className="w-3 border-t border-dashed border-muted-foreground" />}
      {dot && <span className="size-2 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  )
}
