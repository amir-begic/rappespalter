"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { DriftResult, DriftRow } from "@/lib/budget-drift"
import { useT } from "@/lib/i18n/provider"
import type { Locale } from "@/lib/i18n/locales"

const fmtPct = (n: number | null) => n == null ? "" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.round(Math.abs(n) * 100)}%`
const tone = (n: number) => n > 0.5 ? "text-negative" : n < -0.5 ? "text-positive" : ""

// Number and date writing in the current language.
function useFormats() {
  const { f, locale } = useT()
  return {
    fmtR: f.int,
    fmtSigned: (n: number) => `${n > 0.5 ? "+" : n < -0.5 ? "−" : ""}Fr. ${f.int(Math.abs(n))}`,
    monthLabel: (m: string) => monthLabel(locale, m),
    dayLabel: (d: string) => f.date(d + "T00:00:00Z", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
  }
}
const monthLabel = (locale: Locale, m: string) =>
  new Date(m + "-01T00:00:00Z").toLocaleDateString(locale, { month: "short", year: "2-digit", timeZone: "UTC" })

const WINDOWS = [3, 6, 12] as const

// Plan vs. actual over the last few complete months, per budgeted category.
// `version` changes after budgets are saved, so the comparison reloads.
export function BudgetDrift({ version, onUseAverage }: {
  version: number
  onUseAverage: (categoryId: number, amount: number) => void
}) {
  const { t } = useT()
  const { fmtR, fmtSigned, monthLabel, dayLabel } = useFormats()
  const [months, setMonths] = useState<number>(6)
  const [result, setResult] = useState<{ key: string; data?: DriftResult; error?: string } | null>(null)
  const key = `${months}:${version}`

  useEffect(() => {
    let stale = false
    fetch(`/api/budgets/drift?months=${months}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? t("budgets.drift.loadFailed"))
        if (!stale) setResult({ key, data: d })
      })
      .catch(e => { if (!stale) setResult({ key, error: e instanceof Error ? e.message : t("budgets.drift.loadFailed") }) })
    return () => { stale = true }
    // Reloads when the window or the budgets change; t is only read on failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months, key])

  const loading = result?.key !== key
  const d = result?.data
  const totals = d?.totals

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm text-muted-foreground">
          {d?.months.length
            ? t("budgets.drift.titleRange", { from: monthLabel(d.months[0]), to: monthLabel(d.months.at(-1)!) })
            : t("budgets.drift.title")}
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
          <p className="text-sm text-muted-foreground py-6 text-center">{t("common.loading")}</p>
        ) : d.months.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {t("budgets.drift.notEnough")}
          </p>
        ) : d.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t("budgets.drift.setBudget")}</p>
        ) : (
          <div className={loading ? "opacity-60 transition-opacity" : ""}>
            {totals && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
                <Figure label={t("budgets.drift.planned")} value={`Fr. ${fmtR(totals.budget)}`} sub={t("common.perMonth")} />
                <Figure label={t("budgets.drift.spent")} value={`Fr. ${fmtR(totals.avg)}`} sub={t("budgets.drift.avgOf", { count: d.months.length })} />
                <Figure
                  label={t("budgets.drift.drift")} value={fmtSigned(totals.drift)} valueClass={tone(totals.drift)}
                  sub={t("budgets.drift.driftSub", { pct: fmtPct(totals.driftPct), over: totals.monthsOver, total: d.months.length })}
                />
                <Figure
                  label={t("budgets.drift.notBudgeted")} value={`Fr. ${fmtR(d.unbudgeted.avg)}`}
                  sub={d.unbudgeted.categories.slice(0, 2).map(u => u.name).join(", ") || t("common.perMonth")}
                />
              </div>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("dashboard.drill.category")}</TableHead>
                    <TableHead className="text-right">{t("budgets.drift.budget")}</TableHead>
                    <TableHead className="text-right">{t("budgets.drift.avgSpent")}</TableHead>
                    <TableHead className="text-right">{t("budgets.drift.drift")}</TableHead>
                    <TableHead>{t("budgets.drift.byMonth")}</TableHead>
                    <TableHead><span className="sr-only">{t("budgets.drift.actions")}</span></TableHead>
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
                          {t("budgets.drift.overIn", { over: r.monthsOver, total: r.months.length })}
                          {r.trend != null && Math.abs(r.trend) >= Math.max(10, r.budget * 0.05) && (
                            <> · {r.trend > 0 ? t("budgets.drift.rising") : t("budgets.drift.falling")}</>
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
                            title={t("budgets.drift.useTitle", { amount: fmtR(r.suggested) })}
                            onClick={() => onUseAverage(r.categoryId, r.suggested)}
                          >
                            {t("budgets.drift.use", { amount: fmtR(r.suggested) })}
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
                ? t("budgets.drift.footerImported", { date: dayLabel(d.importedThrough), month: monthLabel(d.current) })
                : t("budgets.drift.footerComplete", { month: monthLabel(d.current) })}{" "}
              {t("budgets.drift.footerMore")}
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
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className={`text-lg mt-0.5 ${valueClass}`}>{value}</p>
      <p className="text-xs text-muted-foreground truncate">{sub}</p>
    </div>
  )
}

// One small bar per month, scaled to the row; the dashed line is the budget.
function MonthBars({ row }: { row: DriftRow }) {
  const { t } = useT()
  const { fmtR, monthLabel } = useFormats()
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
            title={t("budgets.drift.barTitle", { month: monthLabel(m.month), spent: fmtR(m.actual), budget: fmtR(row.budget) })}
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
