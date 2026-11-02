"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { PageLoading } from "@/components/page-loading"

interface Snapshot {
  month:    string
  etf:      number
  savings:  number
  pillar3a: number
  pillar2:  number
  checking: number
  total:    number
}

// Asset series, drawn bottom-to-top in the stack. Liquid assets first.
const ASSETS = [
  { key: "checking", label: "Checking",   color: "#d4857a" },
  { key: "savings",  label: "Savings",    color: "#8ab4d4" },
  { key: "etf",      label: "ETF",        color: "#6aaa7a" },
  { key: "pillar3a", label: "Säule 3a",   color: "#f0c080" },
  { key: "pillar2",  label: "2. Säule",   color: "#b89dd4" },
] as const

const fmtR = (n: number) => Math.round(n).toLocaleString("de-CH")
const fmtMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number)
  return new Date(y, mo - 1).toLocaleDateString("de-CH", { month: "short", year: "2-digit" })
}

// Snapshot months are stored as local midnight on the 1st; read them back in
// local time (toISOString would give the previous month east of UTC).
const monthKey = (d: string) => {
  const date = new Date(d)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

type EtfSource = "tracker" | "snapshots"

export default function NetWorthPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null)
  const [tracker, setTracker]     = useState<Record<string, { date: string; value: number }>>({})
  const [source, setSource]       = useState<EtfSource>("tracker")
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch("/api/snapshots").then(r => r.json()),
      // The portfolio tracker is optional: without Yuh data the snapshots stand alone.
      fetch("/api/portfolio/month-ends").then(r => r.json()).catch(() => ({})),
    ])
      .then(([d, t]) => {
        if (d.error) setError(d.error)
        else setSnapshots((d.snapshots ?? []).map((s: { month: string } & Snapshot) => ({ ...s, month: monthKey(s.month) })))
        setTracker(t.months ?? {})
      })
      .catch(() => setError("Failed to load data"))
      .finally(() => setLoading(false))
  }, [])

  // With the tracker selected, the ETF line uses the Yuh account's month-end
  // value wherever the tracker covers that month; earlier months keep the snapshot.
  const covered = snapshots?.filter(s => tracker[s.month]).length ?? 0
  const data = useMemo(() => snapshots?.map(s => {
    const t = source === "tracker" ? tracker[s.month] : undefined
    if (!t) return s
    return { ...s, etf: t.value, total: s.total - s.etf + t.value }
  }) ?? null, [snapshots, tracker, source])

  const latest = data && data.length > 0 ? data[data.length - 1] : null
  const first  = data && data.length > 0 ? data[0] : null
  const liquid = latest ? latest.etf + latest.savings + latest.checking : 0
  const locked = latest ? latest.pillar3a + latest.pillar2 : 0
  const change = latest && first ? latest.total - first.total : 0

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">

      <div className="mb-8">
        <p className="text-xs uppercase text-muted-foreground mb-2">
          Net Worth
        </p>
        <h1>
          Net Worth Over Time
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Total wealth across every account, month by month — the single best gauge of whether you&apos;re on track.
        </p>
      </div>

      {loading && (
        <PageLoading />
      )}

      {error && (
        <div className="text-sm text-destructive py-20 text-center">{error}</div>
      )}

      {data && !loading && data.length === 0 && (
        <p className="text-sm text-muted-foreground py-20 text-center">
          No snapshots recorded yet. Record your balances on the <a href="/projections" className="underline">Projections</a> page each month to build the trend.
        </p>
      )}

      {data && !loading && data.length > 0 && (
        <div className="space-y-4">

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase text-muted-foreground mb-2">Net worth</p>
                <p className="font-display text-3xl">Fr. {fmtR(latest!.total)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase text-muted-foreground mb-2">Change</p>
                <p className={`font-display text-3xl ${change >= 0 ? "text-positive" : "text-negative"}`}>
                  {change >= 0 ? "+" : "−"}Fr. {fmtR(Math.abs(change))}
                </p>
                <p className="text-xs text-muted-foreground mt-1">since {fmtMonth(first!.month)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase text-muted-foreground mb-2">Liquid</p>
                <p className="font-display text-3xl text-positive">Fr. {fmtR(liquid)}</p>
                <p className="text-xs text-muted-foreground mt-1">ETF + savings + checking</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase text-muted-foreground mb-2">Locked</p>
                <p className="font-display text-3xl text-highlight">Fr. {fmtR(locked)}</p>
                <p className="text-xs text-muted-foreground mt-1">3a + 2. Säule</p>
              </CardContent>
            </Card>
          </div>

          {/* Stacked area + total line */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm text-muted-foreground">
                Composition over time
              </CardTitle>
              {covered > 0 && (
                <Tabs value={source} onValueChange={v => setSource(v as EtfSource)}>
                  <TabsList>
                    <TabsTrigger value="tracker">ETF from portfolio</TabsTrigger>
                    <TabsTrigger value="snapshots">ETF from snapshots</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            </CardHeader>
            <CardContent>
              {covered > 0 && (
                <p className="text-xs text-muted-foreground mb-3">
                  {source === "tracker"
                    ? `ETF uses your Yuh portfolio's value at the end of each month (${covered} of ${data.length} months)${covered < data.length ? "; earlier months use the snapshot" : ""}. Other balances come from your snapshots.`
                    : "ETF uses the balances you entered in your snapshots."}
                </p>
              )}
              {data.length === 1 && (
                <p className="text-xs text-muted-foreground mb-3">
                  Only one snapshot so far — record more monthly balances to see the trend.
                </p>
              )}
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={v => fmtR(Number(v))} />
                  <Tooltip
                    labelFormatter={label => fmtMonth(String(label))}
                    formatter={(value, name) => [`Fr. ${fmtR(Number(value))}`, name]}
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "var(--card-foreground)",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  {ASSETS.map(a => (
                    <Area
                      key={a.key}
                      type="monotone"
                      dataKey={a.key}
                      name={a.label}
                      stackId="nw"
                      stroke={a.color}
                      fill={a.color}
                      fillOpacity={0.5}
                    />
                  ))}
                  <Line
                    type="monotone"
                    dataKey="total"
                    name="Total"
                    stroke="var(--foreground)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  )
}
