"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import Link from "next/link"
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

// Other assets and loans at a month end (/api/assets/month-ends).
interface AssetTotals { assets: number; liquid: number; debts: number; commitments: number }

// Asset series, drawn bottom-to-top in the stack. Liquid assets first.
const ASSETS = [
  { key: "checking", label: "Checking",   color: "#d4857a" },
  { key: "savings",  label: "Savings",    color: "#8ab4d4" },
  { key: "etf",      label: "ETF",        color: "#6aaa7a" },
  { key: "pillar3a", label: "Säule 3a",   color: "#f0c080" },
  { key: "pillar2",  label: "2. Säule",   color: "#b89dd4" },
  { key: "other",    label: "Other assets", color: "#e0a8c4" },
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
  const [others, setOthers]       = useState<Record<string, AssetTotals>>({})
  const [withLeases, setWithLeases] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch("/api/snapshots").then(r => r.json()),
      // The portfolio tracker is optional: without Yuh data the snapshots stand alone.
      fetch("/api/portfolio/month-ends").then(r => r.json()).catch(() => ({})),
      // Gold, crypto, a car… and loans/leases (Wealth → Assets), also optional.
      fetch("/api/assets/month-ends").then(r => r.json()).catch(() => ({})),
    ])
      .then(([d, t, o]) => {
        if (d.error) setError(d.error)
        else setSnapshots((d.snapshots ?? []).map((s: { month: string } & Snapshot) => ({ ...s, month: monthKey(s.month) })))
        setTracker(t.months ?? {})
        setOthers(o.months ?? {})
      })
      .catch(() => setError("Failed to load data"))
      .finally(() => setLoading(false))
  }, [])

  // With the tracker selected, the ETF line uses the Yuh account's month-end
  // value wherever the tracker covers that month; earlier months keep the snapshot.
  const covered = snapshots?.filter(s => tracker[s.month]).length ?? 0
  // Other assets add to the stack, debts (and, if chosen, lease payments to come)
  // go below zero; the total line is what's left.
  const data = useMemo(() => snapshots?.map(s => {
    const t = source === "tracker" ? tracker[s.month] : undefined
    const etf = t ? t.value : s.etf
    const o = others[s.month]
    const other = o?.assets ?? 0
    const owed = (o?.debts ?? 0) + (withLeases ? o?.commitments ?? 0 : 0)
    return {
      ...s, etf, other, otherLiquid: o?.liquid ?? 0, owed,
      debts: owed > 0 ? -owed : undefined,
      total: s.total - s.etf + etf + other - owed,
    }
  }) ?? null, [snapshots, tracker, source, others, withLeases])
  const hasOthers = Object.values(others).some(o => o.assets > 0)
  const hasDebts = Object.values(others).some(o => o.debts > 0)
  const hasLeases = Object.values(others).some(o => o.commitments > 0)

  const latest = data && data.length > 0 ? data[data.length - 1] : null
  const first  = data && data.length > 0 ? data[0] : null
  const liquid = latest ? latest.etf + latest.savings + latest.checking + latest.otherLiquid : 0
  const locked = latest ? latest.pillar3a + latest.pillar2 : 0
  const change = latest && first ? latest.total - first.total : 0

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">

      <div className="mb-8">
        <p className="text-xs uppercase text-muted-foreground mb-2">
          Wealth
        </p>
        <h1>
          Net Worth Over Time
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Everything you own — accounts and other assets — less what you owe, month by month: the single best gauge of whether you&apos;re on track.
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
                <p className="font-display text-3xl">{latest!.total < 0 ? "−" : ""}Fr. {fmtR(Math.abs(latest!.total))}</p>
                {latest!.owed > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">after Fr. {fmtR(latest!.owed)} {withLeases ? "owed and leased" : "owed"}</p>
                )}
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
                <p className="text-xs text-muted-foreground mt-1">ETF + savings + checking{latest!.otherLiquid > 0 && " + gold & crypto"}</p>
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
              {(hasOthers || hasDebts || hasLeases) && (
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
                  <span>
                    Other assets and loans come from <Link href="/assets" className="underline">Assets</Link>; a leased
                    car isn&apos;t yours, so it isn&apos;t counted.
                  </span>
                  {hasLeases && (
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={withLeases} onChange={e => setWithLeases(e.target.checked)} className="accent-primary" />
                      Subtract lease payments still to come
                    </label>
                  )}
                </div>
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
                  {ASSETS.filter(a => a.key !== "other" || hasOthers).map(a => (
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
                  {(hasDebts || (withLeases && hasLeases)) && (
                    <Area
                      type="monotone"
                      dataKey="debts"
                      name={withLeases ? "Debts & leases" : "Debts"}
                      stackId="owed"
                      stroke="#c46a5e"
                      fill="#c46a5e"
                      fillOpacity={0.35}
                    />
                  )}
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
