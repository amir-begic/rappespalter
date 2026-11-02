"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageLoading } from "@/components/page-loading"
import type { RecurringResult, RecurringSeries } from "@/lib/recurring"
import { useT } from "@/lib/i18n/provider"

// Number and date writing in the current language.
function useFormats() {
  const { f } = useT()
  return {
    fmt: (n: number) => f.decimal(n),
    fmtR: f.int,
    fmtDate: (d: string) => f.date(d + "T00:00:00", { day: "2-digit", month: "short", year: "2-digit" }),
  }
}

// Bills and subscriptions: what's spent. Savings and transfers are money that
// stays yours, so they're listed but not counted as costs.
const isCost = (s: RecurringSeries) => s.direction === "out" && s.categoryType !== "savings" && s.categoryType !== "transfer"


function Dot({ color }: { color: string | null }) {
  return <span className="inline-block size-2 shrink-0 rounded-sm" style={{ background: color ?? "var(--border)" }} />
}

function SeriesTable({ series }: { series: RecurringSeries[] }) {
  const { t } = useT()
  const { fmt, fmtR, fmtDate } = useFormats()
  const amountLabel = (s: RecurringSeries) => `${s.variable ? "≈ " : ""}Fr. ${fmt(s.typical)}`
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="pb-2 text-left font-normal">{t("recurring.th.payee")}</th>
            <th className="pb-2 text-left font-normal">{t("recurring.th.rhythm")}</th>
            <th className="pb-2 text-right font-normal">{t("recurring.th.amount")}</th>
            <th className="pb-2 text-right font-normal">{t("recurring.th.perYear")}</th>
            <th className="pb-2 text-right font-normal">{t("recurring.th.next")}</th>
          </tr>
        </thead>
        <tbody>
          {series.map(s => (
            <tr key={s.key} className="border-b border-border last:border-0">
              <td className="py-2 pr-3">
                <span className="block truncate max-w-[16rem]">{s.name}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Dot color={s.color} /> {t("recurring.since", { category: s.category ?? t("dashboard.uncategorized"), date: fmtDate(s.first) })}
                </span>
              </td>
              <td className="py-2 pr-3 text-xs text-muted-foreground">{t(`recurring.cadence.${s.cadence}`)}</td>
              <td className="py-2 text-right font-mono">{amountLabel(s)}</td>
              <td className="py-2 text-right font-mono text-muted-foreground">Fr. {fmtR(s.yearly)}</td>
              <td className={`py-2 text-right text-xs ${s.status === "missing" ? "text-negative" : "text-muted-foreground"}`}>
                {s.status === "missing" ? t("recurring.missingSince", { date: fmtDate(s.next) }) : fmtDate(s.next)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function RecurringPage() {
  const { t, rich } = useT()
  const { fmt, fmtR, fmtDate } = useFormats()
  const amountLabel = (s: RecurringSeries) => `${s.variable ? "≈ " : ""}Fr. ${fmt(s.typical)}`
  function dueLabel(inDays: number) {
    if (inDays < 0) return t("recurring.due.now")
    if (inDays === 0) return t("recurring.due.today")
    if (inDays === 1) return t("recurring.due.tomorrow")
    return t("recurring.due.inDays", { days: inDays })
  }
  const [data, setData]   = useState<RecurringResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/recurring")
      .then(r => r.json())
      .then(d => d.error ? setError(d.error) : setData(d))
      .catch(() => setError(t("recurring.loadFailed")))
    // Loads once; t is only read if loading fails.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <p className="text-xs uppercase text-muted-foreground mb-2">{t("nav.section.money")}</p>
        <h1>{t("nav.page.recurring")}</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {data ? t("recurring.introAsOf", { date: fmtDate(data.asOf) }) : t("recurring.intro")}
        </p>
      </div>

      {!data && !error && <PageLoading />}
      {error && <div className="text-sm text-destructive py-20 text-center">{error}</div>}

      {data && data.series.length === 0 && (
        <p className="text-sm text-muted-foreground py-20 text-center">
          {t("recurring.none")}
        </p>
      )}

      {data && data.series.length > 0 && (
        <div className="space-y-4">

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: t("recurring.tile.bills"), value: perMonth(costs),   note: t("recurring.tile.billsNote", { payments: t("recurring.payments", { count: costs.length }), amount: fmtR(perMonth(costs) * 12) }), tone: "text-negative" },
              { label: t("recurring.tile.saved"), value: perMonth(saving),  note: t("recurring.standingOrders", { count: saving.length }), tone: "text-info" },
              { label: t("recurring.tile.income"), value: perMonth(earning), note: t("recurring.sources", { count: earning.length }), tone: "text-positive" },
            ].map(tile => (
              <Card key={tile.label}>
                <CardContent className="pt-6">
                  <p className="text-xs uppercase text-muted-foreground mb-1">{tile.label}</p>
                  <p className={`font-display text-2xl ${tile.tone}`}>Fr. {fmtR(tile.value)}<span className="text-sm text-muted-foreground"> {t("recurring.perMonthUnit")}</span></p>
                  <p className="text-xs text-muted-foreground mt-1">{tile.note}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {alerts.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t("recurring.alerts")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {alerts.map(s => (
                  <div key={s.key} className="flex flex-wrap items-baseline gap-x-2">
                    <Dot color={s.color} />
                    <span className="font-medium">{s.name}</span>
                    {s.change && (
                      <span className="text-muted-foreground">
                        {rich("recurring.changed", { b: text => <strong className="text-foreground">{text}</strong> }, {
                          from: fmt(s.change.from), to: fmt(s.change.to), date: fmtDate(s.change.on),
                        })}
                      </span>
                    )}
                    {s.status === "missing" && (
                      <span className="text-negative">
                        {t("recurring.missing", { date: fmtDate(s.next) })}
                      </span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2 flex flex-row items-baseline justify-between gap-2">
              <CardTitle className="text-sm text-muted-foreground">{t("recurring.upcoming")}</CardTitle>
              {data.upcoming.length > 0 && (
                <span className="text-xs text-muted-foreground">{t("recurring.upcomingTotal", { amount: fmtR(upcomingTotal) })}</span>
              )}
            </CardHeader>
            <CardContent>
              {data.upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("recurring.upcomingNone")}</p>
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
                <CardTitle className="text-sm text-muted-foreground">{t("recurring.outgoing")}</CardTitle>
              </CardHeader>
              <CardContent><SeriesTable series={out} /></CardContent>
            </Card>
          )}

          {income.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t("dashboard.income")}</CardTitle>
              </CardHeader>
              <CardContent><SeriesTable series={income} /></CardContent>
            </Card>
          )}

          <p className="text-xs text-muted-foreground text-center pb-4">
            {t("recurring.footer")}
          </p>
        </div>
      )}
    </div>
  )
}
