"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"

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

export default function NetWorthPage() {
  const [data, setData]       = useState<Snapshot[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/snapshots")
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData((d.snapshots ?? []).map((s: { month: string } & Snapshot) => ({
          ...s,
          month: new Date(s.month).toISOString().slice(0, 7),
        })))
      })
      .catch(() => setError("Failed to load data"))
      .finally(() => setLoading(false))
  }, [])

  const latest = data && data.length > 0 ? data[data.length - 1] : null
  const first  = data && data.length > 0 ? data[0] : null
  const liquid = latest ? latest.etf + latest.savings + latest.checking : 0
  const locked = latest ? latest.pillar3a + latest.pillar2 : 0
  const change = latest && first ? latest.total - first.total : 0

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">

      <div className="mb-8">
        <p className="text-xs tracking-widest uppercase text-muted-foreground mb-2">
          Net Worth
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Net Worth Over Time
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Total wealth across every account, month by month — the single best gauge of whether you&apos;re on track.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground py-20 justify-center">
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Loading...
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive py-20 text-center">{error}</div>
      )}

      {data && !loading && data.length === 0 && (
        <p className="text-sm text-muted-foreground py-20 text-center">
          No snapshots recorded yet. Add monthly balances via the snapshots API to build the trend.
        </p>
      )}

      {data && !loading && data.length > 0 && (
        <div className="space-y-4">

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Net worth</p>
                <p className="text-2xl font-semibold">Fr. {fmtR(latest!.total)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Change</p>
                <p className={`text-2xl font-semibold ${change >= 0 ? "text-green-600" : "text-red-400"}`}>
                  {change >= 0 ? "+" : "−"}Fr. {fmtR(Math.abs(change))}
                </p>
                <p className="text-xs text-muted-foreground mt-1">since {fmtMonth(first!.month)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Liquid</p>
                <p className="text-2xl font-semibold text-green-600">Fr. {fmtR(liquid)}</p>
                <p className="text-xs text-muted-foreground mt-1">ETF + savings + checking</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Locked</p>
                <p className="text-2xl font-semibold text-amber-500">Fr. {fmtR(locked)}</p>
                <p className="text-xs text-muted-foreground mt-1">3a + 2. Säule</p>
              </CardContent>
            </Card>
          </div>

          {/* Stacked area + total line */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Composition over time
              </CardTitle>
            </CardHeader>
            <CardContent>
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
