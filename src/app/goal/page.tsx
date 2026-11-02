"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageLoading } from "@/components/page-loading"

const fmtR = (n: number) => Math.round(n).toLocaleString("de-CH")

// Persisted goal inputs (localStorage — no backend needed).
const STORAGE_KEY = "rappespalter.goal"
interface GoalInputs { price: number; depositPct: number; costsPct: number }
const DEFAULTS: GoalInputs = { price: 900000, depositPct: 20, costsPct: 5 }

export default function GoalPage() {
  const [inputs, setInputs] = useState<GoalInputs>(DEFAULTS)
  const [liquid, setLiquid]         = useState<number | null>(null)
  const [avgSaved, setAvgSaved]     = useState<number>(0)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)

  // Load persisted inputs once.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setInputs({ ...DEFAULTS, ...JSON.parse(raw) })
    } catch { /* ignore corrupt storage */ }
  }, [])

  useEffect(() => {
    Promise.all([
      fetch("/api/snapshots").then(r => r.json()),
      fetch("/api/trends").then(r => r.json()),
    ])
      .then(([snap, trends]) => {
        if (snap.error || trends.error) { setError(snap.error || trends.error); return }
        const snaps: { etf: number; savings: number; checking: number }[] = snap.snapshots ?? []
        const latest = snaps[snaps.length - 1]
        setLiquid(latest ? latest.etf + latest.savings + latest.checking : 0)

        // Trailing 6 *complete* months — drop the in-progress current month so
        // its partial savings don't understate the pace.
        const currentMonth = new Date().toISOString().slice(0, 7)
        const trend: { month: string; liquidSaved: number }[] = trends.trend ?? []
        const recent = trend.filter(r => r.month !== currentMonth).slice(-6)
        setAvgSaved(recent.length ? recent.reduce((s, r) => s + r.liquidSaved, 0) / recent.length : 0)
      })
      .catch(() => setError("Failed to load data"))
      .finally(() => setLoading(false))
  }, [])

  function update(patch: Partial<GoalInputs>) {
    const next = { ...inputs, ...patch }
    setInputs(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }

  const needed    = inputs.price * (inputs.depositPct + inputs.costsPct) / 100
  const current   = liquid ?? 0
  const remaining = Math.max(0, needed - current)
  const progress  = needed > 0 ? Math.min(100, (current / needed) * 100) : 0
  const reached   = remaining <= 0

  const months = !reached && avgSaved > 0 ? Math.ceil(remaining / avgSaved) : null
  const projected = months != null ? (() => {
    const d = new Date()
    d.setMonth(d.getMonth() + months)
    return d.toLocaleDateString("de-CH", { month: "long", year: "numeric" })
  })() : null

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">

      <div className="mb-8">
        <p className="text-xs uppercase text-muted-foreground mb-2">Goal</p>
        <h1>Down-Payment Tracker</h1>
        <p className="text-sm text-muted-foreground mt-2">
          How close your liquid assets are to the deposit on a Swiss property, and when you&apos;ll get there at your current pace.
        </p>
      </div>

      {loading && (
        <PageLoading />
      )}

      {error && <div className="text-sm text-destructive py-20 text-center">{error}</div>}

      {!loading && !error && (
        <div className="space-y-4">

          {/* Inputs */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Target</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <label className="block">
                  <span className="text-xs uppercase text-muted-foreground">Property price (Fr.)</span>
                  <Input
                    type="number" min={0} step={10000} value={inputs.price}
                    onChange={e => update({ price: parseFloat(e.target.value) || 0 })}
                    className="mt-1 h-9"
                  />
                </label>
                <label className="block">
                  <span className="text-xs uppercase text-muted-foreground">Down payment (%)</span>
                  <Input
                    type="number" min={0} max={100} step={1} value={inputs.depositPct}
                    onChange={e => update({ depositPct: parseFloat(e.target.value) || 0 })}
                    className="mt-1 h-9"
                  />
                </label>
                <label className="block">
                  <span className="text-xs uppercase text-muted-foreground">Extra costs (%)</span>
                  <Input
                    type="number" min={0} max={100} step={1} value={inputs.costsPct}
                    onChange={e => update({ costsPct: parseFloat(e.target.value) || 0 })}
                    className="mt-1 h-9"
                  />
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Headline stats */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase text-muted-foreground mb-2">Deposit needed</p>
                <p className="font-display text-3xl">Fr. {fmtR(needed)}</p>
                <p className="text-xs text-muted-foreground mt-1">{inputs.depositPct}% + {inputs.costsPct}% costs</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase text-muted-foreground mb-2">Liquid assets</p>
                <p className="font-display text-3xl text-positive">Fr. {fmtR(current)}</p>
                <p className="text-xs text-muted-foreground mt-1">ETF + savings + checking</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase text-muted-foreground mb-2">Still needed</p>
                <p className="font-display text-3xl text-highlight">Fr. {fmtR(remaining)}</p>
                <p className="text-xs text-muted-foreground mt-1">at Fr. {fmtR(avgSaved)}/mo</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase text-muted-foreground mb-2">On track for</p>
                <p className="font-display text-3xl text-info">
                  {reached ? "Now 🎉" : projected ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {reached ? "deposit covered" : months != null ? `~${months} months` : "increase savings"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Progress */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Progress — {progress.toFixed(0)}% of deposit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-positive transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-2 font-mono">
                <span>Fr. {fmtR(current)}</span>
                <span>Fr. {fmtR(needed)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Projection is linear from your trailing-6-month liquid savings rate and is deliberately
                conservative — it ignores investment growth on your ETF holdings. Säule 3a and 2. Säule
                are excluded as they can&apos;t fund a property purchase.
              </p>
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  )
}
