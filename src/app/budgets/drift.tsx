"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { DriftResult, DriftRow } from "@/lib/budget-drift"

const fmtR = (n: number) => Math.round(n).toLocaleString("de-CH")
const fmtSigned = (n: number) => `${n > 0.5 ? "+" : n < -0.5 ? "−" : ""}Fr. ${fmtR(Math.abs(n))}`
const fmtPct = (n: number | null) => n == null ? "" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.round(Math.abs(n) * 100)}%`
const tone = (n: number) => n > 0.5 ? "text-negative" : n < -0.5 ? "text-positive" : ""
const monthLabel = (m: string) =>
  new Date(m + "-01T00:00:00Z").toLocaleDateString("de-CH", { month: "short", year: "2-digit", timeZone: "UTC" })

const dayLabel = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("de-CH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

const WINDOWS = [3, 6, 12] as const

// Plan vs. actual over the last few complete months, per budgeted category.
// `version` changes after budgets are saved, so the comparison reloads.
export function BudgetDrift({ version, onUseAverage }: {
  version: number
  onUseAverage: (categoryId: number, amount: number) => void
}) {
  const [months, setMonths] = useState<number>(6)
  const [result, setResult] = useState<{ key: string; data?: DriftResult; error?: string } | null>(null)
  const key = `${months}:${version}`

  useEffect(() => {
    let stale = false
    fetch(`/api/budgets/drift?months=${months}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? "Failed to load")
        if (!stale) setResult({ key, data: d })
      })
      .catch(e => { if (!stale) setResult({ key, error: e instanceof Error ? e.message : "Failed to load" }) })
    return () => { stale = true }
  }, [months, key])

  const loading = result?.key !== key
  const d = result?.data
  const t = d?.totals

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Plan vs. actual{d?.months.length ? ` · ${monthLabel(d.months[0])} – ${monthLabel(d.months.at(-1)!)}` : ""}
        </CardTitle>
        <Tabs value={String(months)} onValueChange={v => setMonths(Number(v))}>
          <TabsList>
            {WINDOWS.map(w => <TabsTrigger key={w} value={String(w)}>{w}M</TabsTrigger>)}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {result?.error ? (
          <p className="text-sm text-destructive">{result.error}</p>
        ) : !d ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
        ) : d.months.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Not enough history yet — drift needs at least one complete month of imported transactions.
          </p>
        ) : d.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Set a budget below to compare it with what you spend.</p>
        ) : (
          <div className={loading ? "opacity-60 transition-opacity" : ""}>
            {t && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
                <Figure label="Planned" value={`Fr. ${fmtR(t.budget)}`} sub="per month" />
                <Figure label="Spent" value={`Fr. ${fmtR(t.avg)}`} sub={`average of ${d.months.length} month${d.months.length === 1 ? "" : "s"}`} />
                <Figure
                  label="Drift" value={fmtSigned(t.drift)} valueClass={tone(t.drift)}
                  sub={`${fmtPct(t.driftPct)} · over in ${t.monthsOver} of ${d.months.length}`}
                />
                <Figure
                  label="Not budgeted" value={`Fr. ${fmtR(d.unbudgeted.avg)}`}
                  sub={d.unbudgeted.categories.slice(0, 2).map(u => u.name).join(", ") || "per month"}
                />
              </div>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Budget</TableHead>
                    <TableHead className="text-right">Avg. spent</TableHead>
                    <TableHead className="text-right">Drift</TableHead>
                    <TableHead>By month</TableHead>
                    <TableHead><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.rows.map(r => (
                    <TableRow key={r.categoryId}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: r.color }} />
                          <span className="text-sm">{r.name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground pl-4.5">
                          over in {r.monthsOver} of {r.months.length}
                          {r.trend != null && Math.abs(r.trend) >= Math.max(10, r.budget * 0.05) && (
                            <> · {r.trend > 0 ? "rising" : "falling"}</>
                          )}
                        </p>
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmtR(r.budget)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtR(r.avg)}</TableCell>
                      <TableCell className={`text-right font-mono ${tone(r.drift)}`}>
                        {fmtSigned(r.drift)}
                        {r.driftPct != null && <p className="text-[10px]">{fmtPct(r.driftPct)}</p>}
                      </TableCell>
                      <TableCell><MonthBars row={r} /></TableCell>
                      <TableCell className="text-right">
                        {Math.abs(r.suggested - r.budget) >= 10 && (
                          <Button
                            size="sm" variant="ghost" className="h-7 text-xs"
                            title={`Set the budget field to Fr. ${fmtR(r.suggested)} (save to apply)`}
                            onClick={() => onUseAverage(r.categoryId, r.suggested)}
                          >
                            Use {fmtR(r.suggested)}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
              {d.importedThrough
                ? `Your latest import is from ${dayLabel(d.importedThrough)}, so ${monthLabel(d.current)} isn't complete — import a newer export to include it. `
                : `Complete months only — ${monthLabel(d.current)} is left out until it's over. `}
              Every month is compared with today&apos;s budget, since earlier budgets aren&apos;t stored.
              Spending counts like the dashboard: outgoing payments, without savings and transfers.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Figure({ label, value, sub, valueClass = "" }: { label: string; value: string; sub: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${valueClass}`}>{value}</p>
      <p className="text-xs text-muted-foreground truncate">{sub}</p>
    </div>
  )
}

// One small bar per month, scaled to the row; the dashed line is the budget.
function MonthBars({ row }: { row: DriftRow }) {
  const H = 28
  const max = Math.max(row.budget, ...row.months.map(m => m.actual), 1)
  const budgetY = H - (row.budget / max) * H
  return (
    <div className="relative flex items-end gap-0.5" style={{ height: H, width: row.months.length * 12 }} aria-hidden>
      {row.months.map(m => {
        const over = m.actual > row.budget + 0.005
        return (
          <span
            key={m.month}
            title={`${monthLabel(m.month)}: Fr. ${fmtR(m.actual)} of ${fmtR(row.budget)}`}
            className={`w-2.5 rounded-t-[3px] ${over ? "bg-negative/80" : "bg-muted-foreground/35"}`}
            style={{ height: Math.max(1, (m.actual / max) * H) }}
          />
        )
      })}
      <span
        className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/50"
        style={{ top: budgetY }}
      />
    </div>
  )
}
