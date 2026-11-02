"use client"

import { forwardRef, useMemo, useState } from "react"
import {
  ComposedChart, Bar, Line, Cell, LabelList, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { ALL_STREAM, type StreamAnalysis } from "@/lib/income"

const fmt  = (n: number) => n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtR = (n: number) => Math.round(n).toLocaleString("de-CH")
const fmtK = (n: number) => Math.abs(n) >= 1000 ? `${(n / 1000).toLocaleString("de-CH", { maximumFractionDigits: 1 })}k` : fmtR(n)
const fmtPct = (n: number | null) => n == null ? "—" : `${n > 0 ? "+" : ""}${(n * 100).toFixed(0)}%`
const tone = (n: number | null) => n == null || Math.abs(n) < 0.005 ? "text-muted-foreground" : n > 0 ? "text-positive" : "text-negative"
const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("de-CH", { month: "short", year: "2-digit", timeZone: "UTC" })
const monthLong = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("de-CH", { month: "long", year: "numeric", timeZone: "UTC" })

type View = "monthly" | "yearly"

const tooltipStyle = {
  background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8,
  fontSize: 12, color: "var(--popover-foreground)",
}

// How one income stream develops: picker, headline comparisons, and a monthly
// (with 12-month average) or yearly chart. `year` narrows the monthly chart
// only; comparisons always run up to today.
export const StreamTrends = forwardRef<HTMLDivElement, {
  streams:        StreamAnalysis[]
  selected:       string
  onSelect:       (name: string) => void
  year:           string // "all" or YYYY
  onShowPayments: (name: string) => void
}>(function StreamTrends({ streams, selected, onSelect, year, onShowPayments }, ref) {
  const [view, setView] = useState<View>("monthly")
  const stream = streams.find(s => s.name === selected) ?? streams[0]

  const monthly = useMemo(() => {
    if (!stream) return []
    return year === "all" ? stream.monthly : stream.monthly.filter(p => p.month.startsWith(year))
  }, [stream, year])

  const yearly = useMemo(() => (stream?.yearly ?? []).map(y => ({
    ...y,
    label: y.change == null ? "" : fmtPct(y.change),
  })), [stream])

  if (!stream) return null
  const st = stream.stats
  const thisYear = stream.yearly.find(y => y.isCurrent)

  return (
    <Card ref={ref} className="scroll-mt-20">
      <CardHeader className="pb-2 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm text-muted-foreground">How each source develops</CardTitle>
          <Tabs value={view} onValueChange={v => setView(v as View)}>
            <TabsList>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
              <TabsTrigger value="yearly">Yearly</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {/* Stream picker */}
        <div role="radiogroup" aria-label="Income source" className="flex flex-wrap gap-1.5">
          {streams.map(s => {
            const active = s.name === stream.name
            return (
              <button
                key={s.name}
                role="radio"
                aria-checked={active}
                onClick={() => onSelect(s.name)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                  active ? "border-foreground/30 bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                {s.name}
              </button>
            )
          })}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Headline comparisons */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Last 12 months">
            <p className="text-lg">Fr. {fmtR(st.last12)}</p>
            <p className="text-xs text-muted-foreground">
              <span className={tone(st.last12Change)}>{fmtPct(st.last12Change)}</span> vs Fr. {fmtR(st.prev12)} the year before
            </p>
          </Stat>
          <Stat label={`${thisYear?.year ?? "This year"} so far`}>
            <p className="text-lg">Fr. {fmtR(st.ytd)}</p>
            <p className="text-xs text-muted-foreground">
              <span className={tone(st.ytdChange)}>{fmtPct(st.ytdChange)}</span> vs Fr. {fmtR(st.ytdPrev)} same days last year
            </p>
          </Stat>
          <Stat label="Per month">
            <p className="text-lg">Fr. {fmtR(st.avgPerMonth)}</p>
            <p className="text-xs text-muted-foreground">
              average since {monthLabel(stream.firstMonth)}
              {stream.activeMonths < stream.spanMonths && <> · Fr. {fmtR(st.avgPerActiveMonth)} in months with income ({stream.activeMonths} of {stream.spanMonths})</>}
            </p>
          </Stat>
          <Stat label="Payments">
            <p className="text-lg">{stream.count}</p>
            <p className="text-xs text-muted-foreground">
              Fr. {fmtR(st.avgPayment)} on average
              {st.bestMonth && <> · best month {monthLabel(st.bestMonth.month)} (Fr. {fmtR(st.bestMonth.amount)})</>}
            </p>
          </Stat>
        </div>

        {/* Chart */}
        {view === "monthly" ? (
          monthly.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">No {stream.name} in {year}.</p>
          ) : (
            <div>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={monthly} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={monthLabel} minTickGap={24}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis width={44} tickFormatter={v => fmtK(Number(v))}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: "var(--muted)" }}
                    labelFormatter={l => monthLong(String(l))}
                    formatter={(v, name, item) => name === "amount"
                      ? [`Fr. ${fmt(Number(v))} · ${item.payload.count} payment${item.payload.count === 1 ? "" : "s"}`, "Received"]
                      : [`Fr. ${fmt(Number(v))}`, "12-month average"]}
                  />
                  <Bar dataKey="amount" fill={stream.color} radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Line type="monotone" dataKey="avg12" stroke="var(--foreground)" strokeOpacity={0.7}
                    strokeWidth={1.75} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-4 mt-2 justify-center text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: stream.color }} /> Received per month</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-foreground/70" /> 12-month average — smooths out irregular payments</span>
              </div>
            </div>
          )
        ) : (
          <div>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={yearly} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="year" tickFormatter={y => y === thisYear?.year ? `${y} YTD` : y}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis width={44} tickFormatter={v => fmtK(Number(v))}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "var(--muted)" }}
                  labelFormatter={l => String(l) === thisYear?.year ? `${l} (to date)` : String(l)}
                  formatter={(v, _name, item) => {
                    const y = item.payload as (typeof yearly)[number]
                    const vs = y.change == null ? "" :
                      ` · ${fmtPct(y.change)} vs Fr. ${fmtR(y.compareAmount ?? 0)}${y.isCurrent ? " same days last year" : ""}`
                    return [`Fr. ${fmt(Number(v))} · ${y.count} payment${y.count === 1 ? "" : "s"}${vs}`, "Received"]
                  }}
                />
                <Bar dataKey="amount" radius={[3, 3, 0, 0]} maxBarSize={56}>
                  {yearly.map(y => (
                    <Cell key={y.year} fill={stream.color}
                      fillOpacity={y.isCurrent || y.partialStart ? 0.55 : year !== "all" && y.year !== year ? 0.35 : 1} />
                  ))}
                  <LabelList dataKey="label" position="top" style={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Labels show change vs the previous year{thisYear ? `; ${thisYear.year} is compared with the same days last year` : ""}.
              {stream.yearly[0]?.partialStart && ` ${stream.yearly[0].year} is a partial year (started ${monthLabel(stream.firstMonth)}), so the next year isn't compared against it.`}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {year !== "all" && view === "monthly" ? `Showing ${year}. ` : ""}
            Comparisons run up to today. Last payment: {monthLong(stream.lastMonth)}.
          </span>
          <Button size="sm" variant="outline" onClick={() => onShowPayments(stream.name)}>
            View payments
          </Button>
        </div>
      </CardContent>
    </Card>
  )
})

// Every stream side by side, one column per year; click a row to inspect it.
export function StreamsByYear({ streams, selected, onSelect }: {
  streams:  StreamAnalysis[]
  selected: string
  onSelect: (name: string) => void
}) {
  const all = streams.find(s => s.name === ALL_STREAM)
  if (!all) return null
  const years = all.yearly.map(y => y.year)
  const rows = streams.filter(s => s.name !== ALL_STREAM)

  const cell = (s: StreamAnalysis, year: string) => s.yearly.find(y => y.year === year)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">Sources by year</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              {years.map(y => (
                <TableHead key={y} className="text-right">{y}{y === all.yearly.find(p => p.isCurrent)?.year ? " YTD" : ""}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...rows, all].map(s => (
              <TableRow
                key={s.name}
                onClick={() => onSelect(s.name)}
                aria-selected={s.name === selected}
                className={`cursor-pointer ${s.name === ALL_STREAM ? " border-t-2" : ""} ${s.name === selected ? "bg-accent/60" : ""}`}
              >
                <TableCell className="whitespace-nowrap">
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                    {s.name === ALL_STREAM ? "Total" : s.name}
                  </span>
                </TableCell>
                {years.map(y => {
                  const c = cell(s, y)
                  return (
                    <TableCell key={y} className="text-right font-mono text-xs whitespace-nowrap">
                      {c && c.amount > 0 ? fmtR(c.amount) : <span className="text-muted-foreground">—</span>}
                      {c && c.change != null && c.amount > 0 && (
                        <span className={`block text-[10px] ${tone(c.change)}`}>{fmtPct(c.change)}</span>
                      )}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground mt-3">
          CHF per year; the small figure is the change vs the previous year (same days, for this year). Click a source to see its trend.
        </p>
      </CardContent>
    </Card>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <p className="text-[11px] uppercase text-muted-foreground mb-1">{label}</p>
      {children}
    </div>
  )
}
