"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings"
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from "recharts"

interface Snapshot {
  id:        number
  month:     string
  etf:       number
  savings:   number
  pillar3a:  number
  pillar2:   number
  checking:  number
  total:     number
}

interface ProjectionPoint {
  label:    string
  age:      number
  pillar2:  number
  savings:  number
  pillar3a: number
  etf:      number
  total:    number
}

// ── Projection engine
// Assumptions:
//   ETF:      6% annual return + monthly contributions
//   3a:       5% annual return + monthly contributions
//   Savings:  static (no new contributions, 0.75% interest)
//   2. Säule: 2.5% annual return + monthly contributions
//
// Personal inputs (monthly contributions, starting age, and the fallback opening
// balances used when no snapshot exists yet) come from /api/settings — edited on
// the Settings page, defaulting to the NEXT_PUBLIC_* env vars (see lib/settings).
function buildProjection(snapshots: Snapshot[], settings: Settings): ProjectionPoint[] {
  // Use the most recent snapshot as the starting point; fall back to the
  // configured opening balances if no snapshots exist yet.
  const latest = snapshots.length > 0
    ? snapshots[snapshots.length - 1]
    : {
        etf:      settings.initEtf,
        savings:  settings.initSavings,
        pillar3a: settings.initPillar3a,
        pillar2:  settings.initPillar2,
      }

  const MONTHLY_ETF        = settings.monthlyEtf
  const MONTHLY_3A         = settings.monthly3a
  const MONTHLY_PILLAR2    = settings.monthlyPillar2
  const RATE_ETF           = 0.06 / 12
  const RATE_3A            = 0.05 / 12
  const RATE_SAVINGS       = 0.0075 / 12
  const RATE_PILLAR2       = 0.025 / 12
  const START_AGE          = settings.startAge

  const checkpoints = [0, 12, 36, 60, 84, 120, 180] // months

  let etf      = latest.etf
  let savings  = latest.savings
  let pillar3a = latest.pillar3a
  let pillar2  = latest.pillar2

  const points: ProjectionPoint[] = []
  let month = 0

  for (const checkpoint of checkpoints) {
    // Advance month by month to the next checkpoint
    while (month < checkpoint) {
      etf      = etf      * (1 + RATE_ETF)     + MONTHLY_ETF
      pillar3a = pillar3a * (1 + RATE_3A)      + MONTHLY_3A
      savings  = savings  * (1 + RATE_SAVINGS)
      pillar2  = pillar2  * (1 + RATE_PILLAR2) + MONTHLY_PILLAR2
      month++
    }

    const years = checkpoint / 12
    points.push({
      label:   checkpoint === 0 ? "Now" : `${years}y`,
      age:     START_AGE + years,
      pillar2:  Math.round(pillar2),
      savings:  Math.round(savings),
      pillar3a: Math.round(pillar3a),
      etf:      Math.round(etf),
      total:    Math.round(etf + savings + pillar3a + pillar2),
    })
  }

  return points
}

const fmtR = (n: number) => Math.round(n).toLocaleString("de-CH")

const fmtM = (n: number) =>
  n >= 1_000_000
    ? `Fr. ${(n / 1_000_000).toFixed(2)}M`
    : `Fr. ${Math.round(n / 1000)}k`

const COLORS = {
  pillar2:  "#8ab4d4",
  savings:  "#f0c080",
  pillar3a: "#6aaa7a",
  etf:      "#c5b8d4",
}

export default function ProjectionsPage() {
  const [snapshots, setSnapshots]   = useState<Snapshot[]>([])
  const [loading, setLoading]       = useState(true)
  const [projection, setProjection] = useState<ProjectionPoint[]>([])
  const [settings, setSettings]     = useState<Settings>(DEFAULT_SETTINGS)

  // Snapshot form state
  const [formMonth,    setFormMonth]    = useState("2026-03")
  const [formEtf,      setFormEtf]      = useState("")
  const [formSavings,  setFormSavings]  = useState("")
  const [form3a,       setForm3a]       = useState("")
  const [formPillar2,  setFormPillar2]  = useState("")
  const [formChecking, setFormChecking] = useState("")
  const [saving, setSaving]             = useState(false)
  const [saved,  setSaved]              = useState(false)

  useEffect(() => {
    Promise.all([
      fetch("/api/snapshots").then(r => r.json()),
      fetch("/api/settings").then(r => r.json()).catch(() => ({})),
    ])
      .then(([snapData, settingsData]) => {
        const snaps = snapData.snapshots ?? []
        const cfg   = settingsData.settings ?? DEFAULT_SETTINGS
        setSnapshots(snaps)
        setSettings(cfg)
        setProjection(buildProjection(snaps, cfg))
      })
      .finally(() => setLoading(false))
  }, [])

  async function saveSnapshot() {
    setSaving(true)
    setSaved(false)
    const res = await fetch("/api/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month:    formMonth,
        etf:      parseFloat(formEtf)      || 0,
        savings:  parseFloat(formSavings)  || 0,
        pillar3a: parseFloat(form3a)       || 0,
        pillar2:  parseFloat(formPillar2)  || 0,
        checking: parseFloat(formChecking) || 0,
      }),
    })
    const data = await res.json()
    if (data.snapshot) {
      const updated = [...snapshots.filter(s => s.month !== data.snapshot.month), data.snapshot]
        .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime())
      setSnapshots(updated)
      setProjection(buildProjection(updated, settings))
      setSaved(true)
    }
    setSaving(false)
  }

  const latest    = projection[projection.length - 1]
  const milestone = projection.find(p => p.total >= 1_000_000)

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">

      {/* Header */}
      <div className="mb-8">
        <p className="text-xs tracking-widest uppercase text-muted-foreground mb-2">
          Projections
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          15-Year Wealth Forecast
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Based on current assets and monthly contribution assumptions.{" "}
          <Link href="/settings" className="underline underline-offset-2 hover:text-foreground">
            Edit inputs
          </Link>
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-sm text-muted-foreground py-20 justify-center">
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Loading...
        </div>
      ) : (
        <div className="space-y-4">

          {/* Milestone banner */}
          {milestone && (
            <div className="rounded-lg border border-positive/25 bg-positive/10 px-5 py-4 flex justify-between items-center flex-wrap gap-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-positive/80 mb-1">
                  Millionaire milestone
                </p>
                <p className="text-xl font-semibold text-positive">
                  Age {milestone.age} · Year {milestone.age - settings.startAge}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-positive/80 mb-1 uppercase tracking-widest">
                  15Y total
                </p>
                <p className="text-2xl font-mono text-highlight">
                  {latest ? fmtM(latest.total) : "—"}
                </p>
              </div>
            </div>
          )}

          {/* Snapshot cards */}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {projection.map(p => (
              <Card key={p.label} className="text-center">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
                    {p.label}
                  </p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Age {p.age}
                  </p>
                  <p className={`text-base font-semibold font-mono ${
                    p.total >= 1_000_000 ? "text-highlight" : "text-positive"
                  }`}>
                    {fmtM(p.total)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Area chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total assets over 15 years
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={projection} margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
                  <defs>
                    {Object.entries(COLORS).map(([key, color]) => (
                      <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={color} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={color} stopOpacity={0.05} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={fmtM}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={70}
                  />
                  <Tooltip
                    formatter={(value) => [`Fr. ${fmtR(Number(value))}`, ""]}
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Area type="monotone" dataKey="pillar2"  stackId="1" stroke={COLORS.pillar2}  fill={`url(#grad-pillar2)`}  strokeWidth={1.5} />
                  <Area type="monotone" dataKey="savings"  stackId="1" stroke={COLORS.savings}  fill={`url(#grad-savings)`}  strokeWidth={1.5} />
                  <Area type="monotone" dataKey="pillar3a" stackId="1" stroke={COLORS.pillar3a} fill={`url(#grad-pillar3a)`} strokeWidth={1.5} />
                  <Area type="monotone" dataKey="etf"      stackId="1" stroke={COLORS.etf}      fill={`url(#grad-etf)`}      strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-4 mt-3 justify-center">
                {Object.entries(COLORS).map(([key, color]) => (
                  <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="w-2 h-2 rounded-sm" style={{ background: color }} />
                    {key === "pillar2"  ? "2. Säule"       : ""}
                    {key === "savings"  ? "Savings account" : ""}
                    {key === "pillar3a" ? "Säule 3a"        : ""}
                    {key === "etf"      ? "ETF portfolio"   : ""}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Year 15 breakdown */}
          {latest && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Year 15 breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                {[
                  { label: "2. Säule",        value: latest.pillar2,  color: COLORS.pillar2  },
                  { label: "Savings account", value: latest.savings,  color: COLORS.savings  },
                  { label: "Säule 3a",        value: latest.pillar3a, color: COLORS.pillar3a },
                  { label: "ETF portfolio",   value: latest.etf,      color: COLORS.etf      },
                ].map(row => (
                  <div
                    key={row.label}
                    className="flex justify-between items-center py-2 border-b border-border last:border-0 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-sm" style={{ background: row.color }} />
                      <span className="text-muted-foreground">{row.label}</span>
                    </div>
                    <span className="font-mono" style={{ color: row.color }}>
                      Fr. {fmtR(row.value)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-3 text-sm font-semibold">
                  <span>Total</span>
                  <span className="font-mono text-highlight">
                    Fr. {fmtR(latest.total)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Record snapshot */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Record this month's balances
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-4">
                Update your actual asset balances each month to keep the projection accurate.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Month</label>
                  <input
                    type="month"
                    value={formMonth}
                    onChange={e => setFormMonth(e.target.value)}
                    className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background text-foreground"
                  />
                </div>
                {[
                  { label: "ETF portfolio",    value: formEtf,      set: setFormEtf,      placeholder: "0"  },
                  { label: "Savings account",  value: formSavings,  set: setFormSavings,  placeholder: "0" },
                  { label: "Säule 3a",         value: form3a,       set: setForm3a,        placeholder: "0" },
                  { label: "2. Säule",         value: formPillar2,  set: setFormPillar2,  placeholder: "0" },
                  { label: "Checking account", value: formChecking, set: setFormChecking, placeholder: "0"  },
                ].map(field => (
                  <div key={field.label}>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {field.label}
                    </label>
                    <input
                      type="number"
                      value={field.value}
                      onChange={e => field.set(e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background text-foreground"
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={saveSnapshot}
                  disabled={saving}
                  className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save snapshot"}
                </button>
                {saved && (
                  <span className="text-xs text-positive">
                    ✓ Saved — projection updated
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Snapshot history */}
          {snapshots.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Snapshot history
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left pb-2 font-normal">Month</th>
                        <th className="text-right pb-2 font-normal">ETF</th>
                        <th className="text-right pb-2 font-normal">Savings</th>
                        <th className="text-right pb-2 font-normal">3a</th>
                        <th className="text-right pb-2 font-normal">2. Säule</th>
                        <th className="text-right pb-2 font-normal font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshots.slice().reverse().map(s => (
                        <tr key={s.id} className="border-b border-border last:border-0">
                          <td className="py-2 text-muted-foreground">
                            {new Date(s.month).toLocaleDateString("de-CH", {
                              month: "short", year: "numeric"
                            })}
                          </td>
                          <td className="py-2 text-right font-mono">Fr. {fmtR(s.etf)}</td>
                          <td className="py-2 text-right font-mono">Fr. {fmtR(s.savings)}</td>
                          <td className="py-2 text-right font-mono">Fr. {fmtR(s.pillar3a)}</td>
                          <td className="py-2 text-right font-mono">Fr. {fmtR(s.pillar2)}</td>
                          <td className="py-2 text-right font-mono text-highlight font-semibold">
                            Fr. {fmtR(s.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Assumptions */}
          <p className="text-xs text-muted-foreground text-center pb-4 leading-relaxed">
            ETF 6% avg · Säule 3a 5% · Savings 0.75% (static) · 2. Säule 2.5% + monthly contributions
            <br />
            Projections are estimates. Past performance does not guarantee future results.
          </p>

        </div>
      )}
    </div>
  )
}