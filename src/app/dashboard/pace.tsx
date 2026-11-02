"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PaceResult } from "@/lib/pace"

const fmtR = (n: number) => Math.round(n).toLocaleString("de-CH")
const dayLabel = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("de-CH", { day: "numeric", month: "long", timeZone: "UTC" })

// Projection for the month in progress; renders nothing for a complete month.
export function SpendingPace({ month }: { month: string }) {
  const [result, setResult] = useState<{ month: string; data: PaceResult | null } | null>(null)

  useEffect(() => {
    let stale = false
    fetch(`/api/budgets/pace?month=${month}`)
      .then(r => r.json())
      .then(d => { if (!stale) setResult({ month, data: d.error ? null : d }) })
      .catch(() => { if (!stale) setResult({ month, data: null }) })
    return () => { stale = true }
  }, [month])

  const d = result?.month === month ? result.data : null
  if (!d?.inProgress || d.rows.length === 0) return null

  const atRisk = d.rows.filter(r => r.over > 0.5)
  const t = d.totals

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Month pace</CardTitle>
          <span className="text-xs text-muted-foreground">
            through {dayLabel(d.asOf)} · day {d.day} of {d.daysInMonth}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">
          On pace for <strong>Fr. {fmtR(t.projected)}</strong> in budgeted categories against a plan of Fr. {fmtR(t.budget)}
          {" — "}
          {t.over > 0.5
            ? <span className="text-negative">Fr. {fmtR(t.over)} over</span>
            : <span className="text-positive">Fr. {fmtR(-t.over)} to spare</span>}
          . Spent so far: Fr. {fmtR(t.spent)}.
        </p>

        <div className="space-y-2.5">
          {(atRisk.length ? atRisk : d.rows.slice(0, 3)).map(r => {
            const max = Math.max(r.budget, r.projected, 1)
            const over = r.over > 0.5
            return (
              <div key={r.categoryId}>
                <div className="flex justify-between gap-2 text-xs mb-1">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm" style={{ background: r.color }} />
                    {r.name}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {fmtR(r.spent)} → <span className="text-foreground">{fmtR(r.projected)}</span> of {fmtR(r.budget)}
                    {over && <span className="text-negative"> · +{fmtR(r.over)}</span>}
                  </span>
                </div>
                {/* Spent so far (solid), projected rest (faint), budget (tick). */}
                <div className="relative h-2 bg-muted rounded-full overflow-hidden" title={`Spent Fr. ${fmtR(r.spent)}, projected Fr. ${fmtR(r.projected)}, budget Fr. ${fmtR(r.budget)}`}>
                  <div className={`absolute inset-y-0 left-0 rounded-full ${over ? "bg-negative/30" : "bg-positive/30"}`} style={{ width: `${r.projected / max * 100}%` }} />
                  <div className={`absolute inset-y-0 left-0 rounded-full ${over ? "bg-negative" : "bg-positive"}`} style={{ width: `${r.spent / max * 100}%` }} />
                  <div className="absolute inset-y-0 w-0.5 bg-foreground/60" style={{ left: `calc(${r.budget / max * 100}% - 1px)` }} />
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {atRisk.length
            ? `${atRisk.length} of ${d.rows.length} budgets on pace to go over. `
            : `All ${d.rows.length} budgets on track; showing the closest. `}
          Fixed costs are expected once at their usual amount; variable spending continues at your usual rate
          {d.history.length ? ` (average of the last ${d.history.length} complete months)` : " (no history yet, so straight-line)"}.
        </p>
      </CardContent>
    </Card>
  )
}
