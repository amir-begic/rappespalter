"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageLoading } from "@/components/page-loading"
import type { RecurringResult, RecurringSeries } from "@/lib/recurring"

const fmt = (n: number) =>
  n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtR = (n: number) => Math.round(n).toLocaleString("de-CH")
const fmtDate = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("de-CH", { day: "2-digit", month: "short", year: "2-digit" })

const CADENCE: Record<RecurringSeries["cadence"], string> = {
  monthly: "Monthly", quarterly: "Quarterly", "half-yearly": "Every 6 months", yearly: "Yearly",
}

// Bills and subscriptions: what's spent. Savings and transfers are money that
// stays yours, so they're listed but not counted as costs.
const isCost = (s: RecurringSeries) => s.direction === "out" && s.categoryType !== "savings" && s.categoryType !== "transfer"

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

const amountLabel = (s: RecurringSeries) => `${s.variable ? "≈ " : ""}Fr. ${fmt(s.typical)}`

function dueLabel(inDays: number) {
  if (inDays < 0) return "due now"
  if (inDays === 0) return "today"
  if (inDays === 1) return "tomorrow"
  return `in ${inDays} days`
}

function Dot({ color }: { color: string | null }) {
  return <span className="inline-block size-2 shrink-0 rounded-sm" style={{ background: color ?? "var(--border)" }} />
}

function SeriesTable({ series }: { series: RecurringSeries[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="pb-2 text-left font-normal">Payee</th>
            <th className="pb-2 text-left font-normal">Rhythm</th>
            <th className="pb-2 text-right font-normal">Amount</th>
            <th className="pb-2 text-right font-normal">Per year</th>
            <th className="pb-2 text-right font-normal">Next</th>
          </tr>
        </thead>
        <tbody>
          {series.map(s => (
            <tr key={s.key} className="border-b border-border last:border-0">
              <td className="py-2 pr-3">
                <span className="block truncate max-w-[16rem]">{s.name}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Dot color={s.color} /> {s.category ?? "Uncategorized"} · since {fmtDate(s.first)}
                </span>
              </td>
              <td className="py-2 pr-3 text-xs text-muted-foreground">{CADENCE[s.cadence]}</td>
              <td className="py-2 text-right font-mono">{amountLabel(s)}</td>
              <td className="py-2 text-right font-mono text-muted-foreground">Fr. {fmtR(s.yearly)}</td>
              <td className={`py-2 text-right text-xs ${s.status === "missing" ? "text-negative" : "text-muted-foreground"}`}>
                {s.status === "missing" ? `missing since ${fmtDate(s.next)}` : fmtDate(s.next)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function RecurringPage() {
  const [data, setData]   = useState<RecurringResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/recurring")
      .then(r => r.json())
      .then(d => d.error ? setError(d.error) : setData(d))
      .catch(() => setError("Failed to load recurring payments"))
  }, [])

  const out     = data?.series.filter(s => s.direction === "out") ?? []
  const income  = data?.series.filter(s => s.direction === "in") ?? []
  // The monthly figures count what's still running; missing ones are listed below.
  const running = (list: RecurringSeries[]) => list.filter(s => s.status === "expected")
  const costs   = running(out.filter(isCost))
  const saving  = running(out.filter(s => !isCost(s)))
  const earning = running(income)
  const alerts  = data?.series.filter(s => s.change || s.status === "missing") ?? []
  const perMonth = (list: RecurringSeries[]) => list.reduce((sum, s) => sum + s.yearly, 0) / 12
  const upcomingTotal = data?.upcoming.reduce((sum, s) => sum + s.typical, 0) ?? 0

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">

      <div className="mb-8">
        <p className="text-xs uppercase text-muted-foreground mb-2">Money</p>
        <h1>Recurring</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Standing orders, bills, subscriptions and income that come back on a regular rhythm, found in your
          transactions{data ? ` up to the latest import (${fmtDate(data.asOf)})` : ""}. Payments marked one-off are left out.
        </p>
      </div>

      {!data && !error && <PageLoading />}
      {error && <div className="text-sm text-destructive py-20 text-center">{error}</div>}

      {data && data.series.length === 0 && (
        <p className="text-sm text-muted-foreground py-20 text-center">
          No recurring payments found yet — they show up after three payments in a regular rhythm.
        </p>
      )}

      {data && data.series.length > 0 && (
        <div className="space-y-4">

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: "Bills & subscriptions", value: perMonth(costs),   note: `${plural(costs.length, "payment")} · Fr. ${fmtR(perMonth(costs) * 12)} a year`, tone: "text-negative" },
              { label: "Saved automatically",   value: perMonth(saving),  note: plural(saving.length, "standing order"), tone: "text-info" },
              { label: "Recurring income",      value: perMonth(earning), note: plural(earning.length, "source"), tone: "text-positive" },
            ].map(t => (
              <Card key={t.label}>
                <CardContent className="pt-6">
                  <p className="text-xs uppercase text-muted-foreground mb-1">{t.label}</p>
                  <p className={`font-display text-2xl ${t.tone}`}>Fr. {fmtR(t.value)}<span className="text-sm text-muted-foreground"> / month</span></p>
                  <p className="text-xs text-muted-foreground mt-1">{t.note}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {alerts.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Worth a look</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {alerts.map(s => (
                  <div key={s.key} className="flex flex-wrap items-baseline gap-x-2">
                    <Dot color={s.color} />
                    <span className="font-medium">{s.name}</span>
                    {s.change && (
                      <span className="text-muted-foreground">
                        changed from Fr. {fmt(s.change.from)} to <strong className="text-foreground">Fr. {fmt(s.change.to)}</strong> on {fmtDate(s.change.on)}
                      </span>
                    )}
                    {s.status === "missing" && (
                      <span className="text-negative">
                        expected around {fmtDate(s.next)} but not in the data — stopped, or paid another way?
                      </span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2 flex flex-row items-baseline justify-between gap-2">
              <CardTitle className="text-sm text-muted-foreground">Coming up · next 30 days</CardTitle>
              {data.upcoming.length > 0 && (
                <span className="text-xs text-muted-foreground">Fr. {fmtR(upcomingTotal)} in total</span>
              )}
            </CardHeader>
            <CardContent>
              {data.upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing expected in the next 30 days.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {data.upcoming.map(s => (
                    <li key={s.key} className="flex items-center gap-3 py-2">
                      <span className="w-20 shrink-0 text-xs text-muted-foreground">{fmtDate(s.next)}</span>
                      <Dot color={s.color} />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <span className="text-xs text-muted-foreground">{dueLabel(s.inDays)}</span>
                      <span className="w-28 text-right font-mono">{amountLabel(s)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {out.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Outgoing</CardTitle>
              </CardHeader>
              <CardContent><SeriesTable series={out} /></CardContent>
            </Card>
          )}

          {income.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Income</CardTitle>
              </CardHeader>
              <CardContent><SeriesTable series={income} /></CardContent>
            </Card>
          )}

          <p className="text-xs text-muted-foreground text-center pb-4">
            A payment counts as recurring after three payments in a monthly, quarterly, half-yearly or yearly rhythm.
            ≈ marks amounts that vary; their average is shown.
          </p>
        </div>
      )}
    </div>
  )
}
