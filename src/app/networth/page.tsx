"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import Link from "next/link"
import { PageLoading } from "@/components/page-loading"
import { useT } from "@/lib/i18n/provider"
import type { MessageKey } from "@/locales"

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
  { key: "checking", label: "networth.series.checking", color: "#d4857a" },
  { key: "savings",  label: "networth.series.savings",  color: "#8ab4d4" },
  { key: "etf",      label: "networth.series.etf",      color: "#6aaa7a" },
  { key: "pillar3a", label: "networth.series.pillar3a", color: "#f0c080" },
  { key: "pillar2",  label: "networth.series.pillar2",  color: "#b89dd4" },
  { key: "other",    label: "networth.series.other",    color: "#e0a8c4" },
] as const satisfies readonly { key: string; label: MessageKey; color: string }[]

// Snapshot months are stored as local midnight on the 1st; read them back in
// local time (toISOString would give the previous month east of UTC).
const monthKey = (d: string) => {
  const date = new Date(d)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

type EtfSource = "tracker" | "snapshots"

export default function NetWorthPage() {
  const { t, rich, f } = useT()
  const fmtR = f.int
  const fmtMonth = f.monthShort
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
      .catch(() => setError(t("dashboard.loadFailed")))
      .finally(() => setLoading(false))
    // Loads once; t is only read if loading fails.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // With the tracker selected, the ETF line uses the Yuh account's month-end
  // value wherever the tracker covers that month; earlier months keep the snapshot.
  const covered = snapshots?.filter(s => tracker[s.month]).length ?? 0
  // Other assets add to the stack, debts (and, if chosen, lease payments to come)
  // go below zero; the total line is what's left.
  const data = useMemo(() => snapshots?.map(s => {
    const fromTracker = source === "tracker" ? tracker[s.month] : undefined
    const etf = fromTracker ? fromTracker.value : s.etf
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
          {t("nav.section.wealth")}
        </p>
        <h1>
          {t("networth.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          {t("networth.intro")}
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
          {rich("networth.noSnapshots", { link: text => <a href="/projections" className="underline">{text}</a> })}
        </p>
      )}

      {data && !loading && data.length > 0 && (
        <div className="space-y-4">

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase text-muted-foreground mb-2">{t("networth.netWorth")}</p>
                <p className="font-display text-3xl">{latest!.total < 0 ? "−" : ""}Fr. {fmtR(Math.abs(latest!.total))}</p>
                {latest!.owed > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">{t(withLeases ? "networth.afterOwedLeased" : "networth.afterOwed", { amount: fmtR(latest!.owed) })}</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase text-muted-foreground mb-2">{t("networth.change")}</p>
                <p className={`font-display text-3xl ${change >= 0 ? "text-positive" : "text-negative"}`}>
                  {change >= 0 ? "+" : "−"}Fr. {fmtR(Math.abs(change))}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t("networth.since", { month: fmtMonth(first!.month) })}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase text-muted-foreground mb-2">{t("networth.liquid")}</p>
                <p className="font-display text-3xl text-positive">Fr. {fmtR(liquid)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t(latest!.otherLiquid > 0 ? "networth.liquidNoteMore" : "networth.liquidNote")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase text-muted-foreground mb-2">{t("networth.locked")}</p>
                <p className="font-display text-3xl text-highlight">Fr. {fmtR(locked)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("networth.lockedNote")}</p>
              </CardContent>
            </Card>
          </div>

          {/* Stacked area + total line */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm text-muted-foreground">
                {t("networth.composition")}
              </CardTitle>
              {covered > 0 && (
                <Tabs value={source} onValueChange={v => setSource(v as EtfSource)}>
                  <TabsList>
                    <TabsTrigger value="tracker">{t("networth.etfPortfolio")}</TabsTrigger>
                    <TabsTrigger value="snapshots">{t("networth.etfSnapshots")}</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            </CardHeader>
            <CardContent>
              {covered > 0 && (
                <p className="text-xs text-muted-foreground mb-3">
                  {source === "tracker"
                    ? t(covered < data.length ? "networth.trackerNoteEarlier" : "networth.trackerNote", { covered, total: data.length })
                    : t("networth.snapshotNote")}
                </p>
              )}
              {(hasOthers || hasDebts || hasLeases) && (
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
                  <span>
                    {rich("networth.othersNote", { link: text => <Link href="/assets" className="underline">{text}</Link> })}
                  </span>
                  {hasLeases && (
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={withLeases} onChange={e => setWithLeases(e.target.checked)} className="accent-primary" />
                      {t("networth.subtractLeases")}
                    </label>
                  )}
                </div>
              )}
              {data.length === 1 && (
                <p className="text-xs text-muted-foreground mb-3">
                  {t("networth.oneSnapshot")}
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
                      name={t(a.label)}
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
                      name={withLeases ? t("networth.series.debtsLeases") : t("networth.series.debts")}
                      stackId="owed"
                      stroke="#c46a5e"
                      fill="#c46a5e"
                      fillOpacity={0.35}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="total"
                    name={t("networth.series.total")}
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
