"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PaceResult } from "@/lib/pace"
import { useT } from "@/lib/i18n/provider"

// Projection for the month in progress; renders nothing for a complete month.
export function SpendingPace({ month }: { month: string }) {
  const { t: tr, rich, f } = useT()
  const fmtR = f.int
  const dayLabel = (d: string) => f.date(d + "T00:00:00Z", { day: "numeric", month: "long", timeZone: "UTC" })
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
          <CardTitle className="text-sm text-muted-foreground">{tr("pace.title")}</CardTitle>
          <span className="text-xs text-muted-foreground">
            {tr("pace.through", { date: dayLabel(d.asOf), day: d.day, days: d.daysInMonth })}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">
          {rich(t.over > 0.5 ? "pace.summary.over" : "pace.summary.spare", {
            b: text => <strong>{text}</strong>,
            bad: text => <span className="text-negative">{text}</span>,
            good: text => <span className="text-positive">{text}</span>,
          }, {
            projected: fmtR(t.projected), budget: fmtR(t.budget), spent: fmtR(t.spent),
            over: fmtR(t.over), spare: fmtR(-t.over),
          })}
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
                    {rich("pace.row", { b: text => <span className="text-foreground">{text}</span> }, {
                      spent: fmtR(r.spent), projected: fmtR(r.projected), budget: fmtR(r.budget),
                    })}
                    {over && <span className="text-negative"> · +{fmtR(r.over)}</span>}
                  </span>
                </div>
                {/* Spent so far (solid), projected rest (faint), budget (tick). */}
                <div className="relative h-2 bg-muted rounded-full overflow-hidden" title={tr("pace.barTitle", { spent: fmtR(r.spent), projected: fmtR(r.projected), budget: fmtR(r.budget) })}>
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
            ? tr("pace.atRisk", { count: atRisk.length, total: d.rows.length })
            : tr("pace.allOnTrack", { total: d.rows.length })}{" "}
          {tr("pace.method")}{" "}
          {d.history.length ? tr("pace.history", { count: d.history.length }) : tr("pace.noHistory")}.
        </p>
      </CardContent>
    </Card>
  )
}
