"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { DEFAULT_SETTINGS, ageOn, type Settings } from "@/lib/settings"
import {
  ASSET_KEYS, RETIREMENT_AGE, assumptionsFrom, compareForecast, forecastToRetirement, totalOf,
  type Assumptions, type AssetKey, type Balances,
} from "@/lib/projection"
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts"
import { PageLoading } from "@/components/page-loading"
import { useT } from "@/lib/i18n/provider"
import { ACCOUNT_LABEL } from "@/lib/i18n/labels"

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

// What the forecast starts from: the latest snapshot, or the opening balances from
// Settings until one is recorded. Personal inputs (contributions, birth date)
// come from /api/settings, defaulting to the NEXT_PUBLIC_* env vars (lib/settings).
function startOf(snapshots: Snapshot[], settings: Settings): { balances: Balances; month: string } {
  const last = snapshots.at(-1)
  if (last) return { balances: last, month: monthKey(last.month) }
  const d = new Date()
  return {
    balances: { etf: settings.initEtf, savings: settings.initSavings, pillar3a: settings.initPillar3a, pillar2: settings.initPillar2 },
    month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
  }
}

// The calculator: the plan from Settings with the default returns, which the
// sliders change for this visit only — nothing is saved.
// inflation: 0 shows nominal francs; above 0, every amount is in today's francs.
interface Scenario { a: Assumptions; retirementAge: number; inflation: number }
const planOf = (settings: Settings): Scenario => ({ a: assumptionsFrom(settings), retirementAge: RETIREMENT_AGE, inflation: 0 })
const sameScenario = (x: Scenario, y: Scenario) => JSON.stringify(x) === JSON.stringify(y)

// Snapshot months are stored as local midnight on the 1st; read them back in
// local time (toISOString would give the previous month east of UTC).
const monthKey = (d: string) => {
  const date = new Date(d)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

// Number, month and account-name writing in the current language.
function useFormats() {
  const { t, f, locale } = useT()
  const fmtR = f.int
  return {
    fmtR,
    fmtMonth: f.monthShort,
    fmtMonthLong: f.monthLong,
    fmtSigned: (n: number) => `${Math.round(n) >= 0 ? "+" : "−"}Fr. ${fmtR(Math.abs(n))}`,
    fmtPct: (r: number) => f.percent(r, 2),
    fmtM: (n: number) => n >= 1_000_000
      ? `Fr. ${(n / 1_000_000).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`
      : `Fr. ${Math.round(n / 1000)}k`,
    assetLabel: (k: keyof typeof ACCOUNT_LABEL) => t(ACCOUNT_LABEL[k]),
  }
}

const COLORS = {
  pillar2:  "#8ab4d4",
  savings:  "#f0c080",
  pillar3a: "#6aaa7a",
  etf:      "#c5b8d4",
}

export default function ProjectionsPage() {
  const { t, rich, f } = useT()
  const { fmtR, fmtMonth, fmtMonthLong, fmtSigned, fmtPct, fmtM, assetLabel } = useFormats()
  const [snapshots, setSnapshots]   = useState<Snapshot[]>([])
  const [loading, setLoading]       = useState(true)
  const [settings, setSettings]     = useState<Settings>(DEFAULT_SETTINGS)
  const [scenario, setScenario]     = useState<Scenario>(() => planOf(DEFAULT_SETTINGS))

  // Snapshot form state
  const [formMonth,    setFormMonth]    = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })
  const [formEtf,      setFormEtf]      = useState("")
  const [formSavings,  setFormSavings]  = useState("")
  const [form3a,       setForm3a]       = useState("")
  const [formPillar2,  setFormPillar2]  = useState("")
  const [formChecking, setFormChecking] = useState("")
  const [saving, setSaving]             = useState(false)
  const [saved,  setSaved]              = useState(false)
  // Yuh portfolio value at each month's end, offered for the ETF field.
  const [tracker, setTracker] = useState<Record<string, { date: string; value: number }>>({})

  useEffect(() => {
    Promise.all([
      fetch("/api/snapshots").then(r => r.json()),
      fetch("/api/settings").then(r => r.json()).catch(() => ({})),
      fetch("/api/portfolio/month-ends").then(r => r.json()).catch(() => ({})),
    ])
      .then(([snapData, settingsData, trackerData]) => {
        setTracker(trackerData.months ?? {})
        const snaps = snapData.snapshots ?? []
        const cfg   = settingsData.settings ?? DEFAULT_SETTINGS
        setSnapshots(snaps)
        setSettings(cfg)
        setScenario(planOf(cfg))
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
      setSaved(true)
    }
    setSaving(false)
  }

  // The forecast, month by month until retirement (one point a year).
  const start     = startOf(snapshots, settings)
  const birthDate = settings.birthDate ?? `${new Date().getFullYear() - 30}-01-01`
  const forecast  = forecastToRetirement(start.balances, start.month, birthDate, scenario.retirementAge, scenario.a, scenario.inflation)
  const real      = scenario.inflation > 0
  const final     = forecast.at(-1)!
  const changed   = !sameScenario(scenario, planOf(settings))
  // Cards: now, every 5 years of age (10 for long spans), and retirement.
  const step      = scenario.retirementAge - (forecast[0]?.age ?? 0) > 35 ? 10 : 5
  const cards     = forecast.filter((p, i) => i === 0 || i === forecast.length - 1 || (p.age % step === 0 && scenario.retirementAge - p.age >= step / 2))
  // What goes in over the whole span vs. what returns add.
  const years     = final.age - (forecast[0]?.age ?? final.age)
  const growth    = final.total - totalOf(start.balances) - final.paidIn

  // Forecast vs. actual: what the forecast made at an earlier snapshot expected.
  // Any snapshot but the latest can be the starting point; default is the first.
  const [baseMonth, setBaseMonth] = useState<string | null>(null)
  const snapMonths  = snapshots.map(s => ({ ...s, month: monthKey(s.month) }))
  const baseOptions = snapMonths.slice(0, -1).map(s => s.month)
  const base = baseMonth && baseOptions.includes(baseMonth) ? baseMonth : baseOptions[0]
  const comparison = base ? compareForecast(snapMonths, base, assumptionsFrom(settings)) : null
  const gap = comparison
    ? totalOf(comparison.today.actual) - totalOf(comparison.today.plan)
    : 0

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">

      {/* Header */}
      <div className="mb-8">
        <p className="text-xs uppercase text-muted-foreground mb-2">
          {t("nav.page.projections")}
        </p>
        <h1>
          {t("proj.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          {rich("proj.intro", {
            link: text => <Link href="/settings" className="underline underline-offset-2 hover:text-foreground">{text}</Link>,
          }, { age: scenario.retirementAge })}
        </p>
      </div>

      {loading ? (
        <PageLoading />
      ) : (
        <div className="space-y-4">

          {/* Checkpoints by age */}
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
            {cards.map((p, i) => (
              <Card key={p.month} className="text-center">
                <CardContent className="px-1 pt-4 pb-3">
                  <p className="text-xs uppercase text-muted-foreground mb-1">
                    {i === 0 ? t("proj.now") : t("proj.ageN", { age: p.age })}
                  </p>
                  <p className="text-xs text-muted-foreground mb-2">
                    {i === 0 ? t("proj.ageN", { age: ageOn(birthDate) }) : p.month.slice(0, 4)}
                  </p>
                  <p className="text-sm font-mono whitespace-nowrap">{fmtM(p.total)}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Area chart */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-baseline justify-between gap-2">
              <CardTitle className="text-sm text-muted-foreground">
                {t(real ? "proj.chartTitleReal" : "proj.chartTitle", { age: scenario.retirementAge })}
              </CardTitle>
              {changed && <span className="text-xs text-info">{t("proj.whatIf")}</span>}
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={forecast} margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
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
                    dataKey="age"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={16}
                  />
                  <YAxis
                    tickFormatter={fmtM}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={70}
                  />
                  <Tooltip
                    labelFormatter={(age, payload) => t("proj.tooltipAge", { age: String(age), month: payload?.[0]?.payload?.month ? fmtMonth(payload[0].payload.month) : "" })}
                    formatter={(value, name) => [`Fr. ${fmtR(Number(value))}`, name != null && String(name) in ACCOUNT_LABEL ? assetLabel(name as AssetKey) : name]}
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Area type="monotone" dataKey="pillar2"  stackId="1" stroke={COLORS.pillar2}  fill={`url(#grad-pillar2)`}  strokeWidth={1.5} isAnimationActive={false} />
                  <Area type="monotone" dataKey="savings"  stackId="1" stroke={COLORS.savings}  fill={`url(#grad-savings)`}  strokeWidth={1.5} isAnimationActive={false} />
                  <Area type="monotone" dataKey="pillar3a" stackId="1" stroke={COLORS.pillar3a} fill={`url(#grad-pillar3a)`} strokeWidth={1.5} isAnimationActive={false} />
                  <Area type="monotone" dataKey="etf"      stackId="1" stroke={COLORS.etf}      fill={`url(#grad-etf)`}      strokeWidth={1.5} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-4 mt-3 justify-center">
                {ASSET_KEYS.map(key => (
                  <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="w-2 h-2 rounded-sm" style={{ background: COLORS[key] }} />
                    {assetLabel(key)}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Calculator */}
          <Calculator
            scenario={scenario}
            changed={changed}
            onChange={setScenario}
            onReset={() => setScenario(planOf(settings))}
          />

          {/* At retirement */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {t("proj.atRetirement", { age: scenario.retirementAge, month: fmtMonthLong(final.month) })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ASSET_KEYS.map(key => (
                <div key={key} className="flex justify-between items-center py-2 border-b border-border text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-sm" style={{ background: COLORS[key] }} />
                    <span className="text-muted-foreground">{assetLabel(key)}</span>
                  </div>
                  <span className="font-mono">Fr. {fmtR(final[key])}</span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-3 text-sm font-semibold">
                <span>{t("common.total")}</span>
                <span className="font-mono">Fr. {fmtR(final.total)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {real && <>{t("proj.summaryReal", { rate: fmtPct(scenario.inflation) })} </>}
                {t(real ? "proj.summaryNet" : "proj.summary", {
                  today: fmtR(totalOf(start.balances)), paidIn: fmtR(final.paidIn), count: years, growth: fmtR(growth),
                })}
              </p>
            </CardContent>
          </Card>

          {/* Forecast vs. actual */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm text-muted-foreground">
                {t("proj.fva.title")}
              </CardTitle>
              {comparison && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  {t("proj.fva.from")}
                  <select
                    value={base}
                    onChange={e => setBaseMonth(e.target.value)}
                    className="text-xs rounded-xl border border-input px-2 py-1 bg-card text-foreground"
                  >
                    {baseOptions.map(m => (
                      <option key={m} value={m}>{fmtMonth(m)}</option>
                    ))}
                  </select>
                </label>
              )}
            </CardHeader>
            <CardContent>
              {!comparison ? (
                <p className="text-xs text-muted-foreground">
                  {t("proj.fva.none")}
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-3">
                    {t("proj.fva.explain", { month: fmtMonth(comparison.base) })}
                  </p>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={comparison.points} margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="month"
                        tickFormatter={fmtMonth}
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={16}
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        tickFormatter={fmtM}
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        axisLine={false}
                        tickLine={false}
                        width={70}
                      />
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
                      <ReferenceLine
                        x={comparison.latest}
                        stroke="var(--muted-foreground)"
                        strokeOpacity={0.5}
                        label={{ value: t("proj.fva.latest"), position: "insideTopRight", fontSize: 10, fill: "var(--muted-foreground)" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="plan"
                        name={t("proj.fva.plan", { month: fmtMonth(comparison.base) })}
                        stroke="var(--info)"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="current"
                        name={t("proj.fva.fromNow")}
                        stroke="var(--highlight)"
                        strokeWidth={2}
                        strokeDasharray="2 3"
                        dot={false}
                      />
                      <Line
                        type="linear"
                        dataKey="actual"
                        name={t("proj.fva.actual")}
                        stroke="var(--foreground)"
                        strokeWidth={2}
                        dot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: "var(--foreground)" }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="text-left pb-2 font-normal">{fmtMonth(comparison.latest)}</th>
                          <th className="text-right pb-2 font-normal">{t("proj.fva.actual")}</th>
                          <th className="text-right pb-2 font-normal">{t("proj.fva.plan", { month: fmtMonth(comparison.base) })}</th>
                          <th className="text-right pb-2 font-normal">{t("proj.fva.difference")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ASSET_KEYS.map(k => {
                          const diff = comparison.today.actual[k] - comparison.today.plan[k]
                          return (
                            <tr key={k} className="border-b border-border">
                              <td className="py-2 text-muted-foreground">{assetLabel(k)}</td>
                              <td className="py-2 text-right font-mono">Fr. {fmtR(comparison.today.actual[k])}</td>
                              <td className="py-2 text-right font-mono">Fr. {fmtR(comparison.today.plan[k])}</td>
                              <td className={`py-2 text-right font-mono ${diff >= 0 ? "text-positive" : "text-negative"}`}>
                                {fmtSigned(diff)}
                              </td>
                            </tr>
                          )
                        })}
                        <tr >
                          <td className="pt-2">{t("common.total")}</td>
                          <td className="pt-2 text-right font-mono">Fr. {fmtR(totalOf(comparison.today.actual))}</td>
                          <td className="pt-2 text-right font-mono">Fr. {fmtR(totalOf(comparison.today.plan))}</td>
                          <td className={`pt-2 text-right font-mono ${gap >= 0 ? "text-positive" : "text-negative"}`}>
                            {fmtSigned(gap)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    {t("proj.fva.note")}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Record snapshot */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {t("proj.record.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-4">
                {t("proj.record.intro")}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("proj.record.month")}</label>
                  <input
                    type="month"
                    value={formMonth}
                    onChange={e => setFormMonth(e.target.value)}
                    className="w-full text-sm rounded-xl border border-input px-3 py-2 bg-card text-foreground"
                  />
                </div>
                {([
                  { key: "etf",      value: formEtf,      set: setFormEtf,      placeholder: "0" },
                  { key: "savings",  value: formSavings,  set: setFormSavings,  placeholder: "0" },
                  { key: "pillar3a", value: form3a,       set: setForm3a,       placeholder: "0" },
                  { key: "pillar2",  value: formPillar2,  set: setFormPillar2,  placeholder: "0" },
                  { key: "checking", value: formChecking, set: setFormChecking, placeholder: "0" },
                ] as const).map(field => (
                  <div key={field.key}>
                    <label className="text-xs text-muted-foreground mb-1 flex items-center justify-between gap-2">
                      {assetLabel(field.key)}
                      {field.key === "etf" && tracker[formMonth] && (
                        <button
                          type="button"
                          className="text-[11px] underline hover:text-foreground"
                          title={t("proj.record.yuhTitle", { date: tracker[formMonth].date })}
                          onClick={() => setFormEtf(String(Math.round(tracker[formMonth].value)))}
                        >
                          {t("proj.record.usePortfolio", { amount: fmtR(tracker[formMonth].value) })}
                        </button>
                      )}
                    </label>
                    <input
                      type="number"
                      value={field.value}
                      onChange={e => field.set(e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full text-sm rounded-xl border border-input px-3 py-2 bg-card text-foreground"
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
                  {saving ? t("common.saving") : t("proj.record.save")}
                </button>
                {saved && (
                  <span className="text-xs text-positive">
                    {t("proj.record.saved")}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Snapshot history */}
          {snapshots.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  {t("proj.history.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left pb-2 font-normal">{t("proj.history.month")}</th>
                        <th className="text-right pb-2 font-normal">{t("networth.series.etf")}</th>
                        <th className="text-right pb-2 font-normal">{t("proj.history.savings")}</th>
                        <th className="text-right pb-2 font-normal">{t("proj.history.pillar3a")}</th>
                        <th className="text-right pb-2 font-normal">{t("account.pillar2")}</th>
                        <th className="text-right pb-2 font-normal">{t("common.total")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshots.slice().reverse().map(s => (
                        <tr key={s.id} className="border-b border-border last:border-0">
                          <td className="py-2 text-muted-foreground">
                            {f.date(s.month, { month: "short", year: "numeric" })}
                          </td>
                          <td className="py-2 text-right font-mono">Fr. {fmtR(s.etf)}</td>
                          <td className="py-2 text-right font-mono">Fr. {fmtR(s.savings)}</td>
                          <td className="py-2 text-right font-mono">Fr. {fmtR(s.pillar3a)}</td>
                          <td className="py-2 text-right font-mono">Fr. {fmtR(s.pillar2)}</td>
                          <td className="py-2 text-right font-mono text-highlight">
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
            {t("proj.assumptions", { list: ASSET_KEYS.map(k => `${assetLabel(k)} ${fmtPct(scenario.a.rates[k])}`).join(" · ") })}
            {" "}{real
              ? t("proj.assumptionsReal", { rate: fmtPct(scenario.inflation) })
              : t("proj.assumptionsNominal")}
            <br />
            {t("proj.disclaimer")}
          </p>

        </div>
      )}
    </div>
  )
}
// Sliders for returns, contributions and retirement age. Changes only this view.
const RETURN_MAX = 0.12
const MONTHLY_MAX: Record<AssetKey, number> = { etf: 10000, savings: 5000, pillar3a: 1000, pillar2: 3000 }
const MONTHLY_STEP: Record<AssetKey, number> = { etf: 50, savings: 50, pillar3a: 10, pillar2: 25 }

function Slider({ label, value, min, max, step, display, onChange }: {
  label: string; value: number; min: number; max: number; step: number
  display: string; onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{display}</span>
      </span>
      <input
        type="range" min={min} max={Math.max(max, value)} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-primary"
      />
    </label>
  )
}

function Calculator({ scenario, changed, onChange, onReset }: {
  scenario: Scenario; changed: boolean
  onChange: (s: Scenario) => void; onReset: () => void
}) {
  const { t, rich } = useT()
  const { fmtR, fmtPct, assetLabel } = useFormats()
  const set = (part: "rates" | "monthly", key: AssetKey, value: number) =>
    onChange({ ...scenario, a: { ...scenario.a, [part]: { ...scenario.a[part], [key]: value } } })

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm text-muted-foreground">{t("proj.calc.title")}</CardTitle>
        {changed && <Button size="sm" variant="outline" onClick={onReset}>{t("proj.calc.reset")}</Button>}
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">
          {rich("proj.calc.intro", { link: text => <Link href="/settings" className="underline">{text}</Link> })}
        </p>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <div className="space-y-3">
            <p className="text-xs uppercase text-muted-foreground">{t("proj.calc.returns")}</p>
            {ASSET_KEYS.map(k => (
              <Slider
                key={k} label={assetLabel(k)} value={scenario.a.rates[k]}
                min={0} max={RETURN_MAX} step={0.0025} display={fmtPct(scenario.a.rates[k])}
                onChange={v => set("rates", k, v)}
              />
            ))}
          </div>
          <div className="space-y-3">
            <p className="text-xs uppercase text-muted-foreground">{t("proj.calc.monthly")}</p>
            {ASSET_KEYS.map(k => (
              <Slider
                key={k} label={assetLabel(k)} value={scenario.a.monthly[k]}
                min={0} max={MONTHLY_MAX[k]} step={MONTHLY_STEP[k]} display={`Fr. ${fmtR(scenario.a.monthly[k])}`}
                onChange={v => set("monthly", k, v)}
              />
            ))}
          </div>
          <Slider
            label={t("proj.calc.retirementAge")} value={scenario.retirementAge}
            min={58} max={70} step={1} display={String(scenario.retirementAge)}
            onChange={v => onChange({ ...scenario, retirementAge: v })}
          />
          <div>
            <Slider
              label={t("proj.calc.inflation")} value={scenario.inflation}
              min={0} max={0.04} step={0.0025}
              display={scenario.inflation > 0 ? fmtPct(scenario.inflation) : t("proj.calc.off")}
              onChange={v => onChange({ ...scenario, inflation: v })}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("proj.calc.inflationHint")}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
