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

const fmtR   = (n: number) => Math.round(n).toLocaleString("de-CH")
const fmt2   = (n: number) => n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtQty = (n: number) => n.toLocaleString("de-CH", { maximumFractionDigits: 4 })
const fmtPct = (n: number | null) => n == null ? "—" : `${n > 0 ? "+" : ""}${(n * 100).toFixed(2)}%`
const fmtSigned = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}Fr. ${fmt2(Math.abs(n))}`
const tone = (n: number | null) => n == null || Math.abs(n) < 1e-9 ? "" : n > 0 ? "text-positive" : "text-negative"
const dayLabel = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("de-CH", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" })

const RANGES = { "3M": 91, "6M": 182, "1Y": 365, "All": Infinity } as const
type Range = keyof typeof RANGES
type View = "price" | "position"

const SERIES_LABELS: Record<string, string> = {
  price: "Market price", avgCost: "Your average cost", buy: "Bought at", sell: "Sold at",
  value: "Position value", cost: "Cost basis",
}

export default function HoldingPage() {
  const { symbol } = useParams<{ symbol: string }>()
  const [data, setData]   = useState<HoldingDetailSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<Range>("All")
  const [view, setView]   = useState<View>("price")

  useEffect(() => {
    fetch(`/api/portfolio/holdings/${encodeURIComponent(symbol)}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? "Failed to load holding")
        setData(d)
      })
      .catch(e => setError(e.message))
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
        <ArrowLeft className="size-4" /> Portfolio
      </Link>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !data || !s ? (
        <div className="flex items-center gap-3 text-sm text-muted-foreground py-20 justify-center">
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Loading...
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header */}
          <div className="mb-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="font-mono text-xs uppercase text-muted-foreground">{data.symbol}</span>
              {data.kind && <Badge variant="outline">{data.kind === "ETF" || data.kind === "MUTUALFUND" ? "ETF" : "Stock"}</Badge>}
              {data.source?.priceSource === "manual"
                ? <Badge variant="secondary">Manual prices</Badge>
                : data.source?.priceSymbol && <Badge variant="outline">Priced from {data.source.priceSymbol}</Badge>}
              {s.units === 0 && <Badge variant="secondary">Position closed</Badge>}
            </div>
            <h1>{data.name}</h1>
            {s.price != null && (
              <p className="text-sm text-muted-foreground mt-2">
                <span className="font-mono text-foreground">{fmt2(s.price)} {ccy}</span>
                {s.priceDate && <> · {s.priceIsTrade ? "last trade" : "close"} {dayLabel(s.priceDate)}</>}
                {s.priceChangeSinceFirstBuy != null && (
                  <> · <span className={tone(s.priceChangeSinceFirstBuy)}>{fmtPct(s.priceChangeSinceFirstBuy)}</span> since your first buy</>
                )}
              </p>
            )}
          </div>

          {data.warnings.length > 0 && (
            <ul className="rounded-lg border border-highlight/40 bg-highlight/10 px-4 py-2.5 text-sm space-y-0.5">
              {data.warnings.map(w => <li key={w}>{w}</li>)}
            </ul>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Position">
              <p className="font-display text-3xl">Fr. {fmtR(s.value)}</p>
              <p className="text-xs text-muted-foreground mt-1">{fmtQty(s.units)} units</p>
            </Stat>
            <Stat label="Average cost">
              <p className="font-display text-3xl">{s.avgCost != null ? `${fmt2(s.avgCost)} ${ccy}` : "—"}</p>
              <p className="text-xs text-muted-foreground mt-1">
                per unit, fees included{s.avgCostChf != null && ccy !== "CHF" ? ` · Fr. ${fmt2(s.avgCostChf)}` : ""}
              </p>
            </Stat>
            <Stat label="Unrealised gain">
              <p className={`font-display text-3xl ${tone(s.unrealized)}`}>{fmtSigned(s.unrealized)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                <span className={tone(s.unrealizedPct)}>{fmtPct(s.unrealizedPct)}</span> on Fr. {fmtR(s.costBasis)} cost
              </p>
            </Stat>
            <Stat label="Total return">
              <p className={`font-display text-3xl ${tone(s.totalReturn)}`}>{fmtSigned(s.totalReturn)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                <span className={tone(s.totalReturnPct)}>{fmtPct(s.totalReturnPct)}</span> of Fr. {fmtR(s.totalBought)} bought
              </p>
            </Stat>
          </div>

          <p className="text-xs text-muted-foreground">
            Total return = unrealised {fmtSigned(s.unrealized)} + realised from sales {fmtSigned(s.realized)} + dividends {fmtSigned(s.dividends)}.
            {" "}Fees paid: Fr. {fmt2(s.fees)}.
          </p>

          {/* Chart */}
          <Card>
            <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2">
              <Tabs value={view} onValueChange={v => setView(v as View)}>
                <TabsList>
                  <TabsTrigger value="price">Price &amp; trades</TabsTrigger>
                  <TabsTrigger value="position">Position value</TabsTrigger>
                </TabsList>
              </Tabs>
              <Tabs value={range} onValueChange={v => setRange(v as Range)}>
                <TabsList>
                  {(Object.keys(RANGES) as Range[]).map(r => <TabsTrigger key={r} value={r}>{r}</TabsTrigger>)}
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
                      SERIES_LABELS[String(name)] ?? name,
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
                    <Legend line>Market price ({ccy})</Legend>
                    <Legend dashed>Your average cost</Legend>
                    <Legend dot="var(--positive)">Buy</Legend>
                    {data.trades.some(t => t.type === "sell") && <Legend dot="var(--negative)">Sell</Legend>}
                  </>
                ) : (
                  <>
                    <Legend line>Position value (CHF)</Legend>
                    <Legend dashed>Cost basis</Legend>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Trades */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Trades</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Fee</TableHead>
                    <TableHead className="text-right">vs. today</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...data.trades].reverse().map((t, i) => {
                    const vsToday = s.price != null && t.priceQuoted ? s.price / t.priceQuoted - 1 : null
                    return (
                      <TableRow key={`${t.date}-${i}`}>
                        <TableCell className="whitespace-nowrap">{dayLabel(t.date)}</TableCell>
                        <TableCell>
                          <span className={t.type === "buy" ? "text-positive" : "text-negative"}>
                            {t.type === "buy" ? "Buy" : "Sell"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono">{fmtQty(t.quantity)}</TableCell>
                        <TableCell className="text-right font-mono whitespace-nowrap">{fmt2(t.price)} {t.currency}</TableCell>
                        <TableCell className="text-right font-mono whitespace-nowrap">{fmt2(Math.abs(t.amount))} {t.currency}</TableCell>
                        <TableCell className="text-right font-mono">{fmt2(t.fee)}</TableCell>
                        <TableCell className={`text-right font-mono ${t.type === "buy" ? tone(vsToday) : ""}`}>
                          {t.type === "buy" ? fmtPct(vsToday) : "—"}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground mt-3">
                &ldquo;vs. today&rdquo; is the price change since each buy, before fees.
              </p>
            </CardContent>
          </Card>

          {/* Dividends */}
          {data.dividends.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Dividends</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Received (net)</TableHead>
                      <TableHead className="text-right">Withholding tax</TableHead>
                      <TableHead className="text-right">In CHF</TableHead>
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
                  Total Fr. {fmt2(s.dividends)} net · Fr. {fmt2(s.withholdingTax)} withheld
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
