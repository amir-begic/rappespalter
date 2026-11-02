"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { PageLoading } from "@/components/page-loading"
import { useT } from "@/lib/i18n/provider"

interface TrendRow {
  month:       string
  income:      number
  expenses:    number
  saved:       number
  liquidSaved: number
  net:         number
  savingsRate: number
}

export default function TrendsPage() {
  const { t, f } = useT()
  const fmtR = f.int
  const fmtMonth = f.monthShort
  const [data, setData]       = useState<TrendRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/trends")
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(d.trend ?? [])
      })
      .catch(() => setError(t("dashboard.loadFailed")))
      .finally(() => setLoading(false))
    // Loads once; t is only read if loading fails.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Averages over the trailing 6 *complete* months — exclude the in-progress
  // current month, whose partial totals would skew the averages downward.
  const currentMonth = new Date().toISOString().slice(0, 7)
  const recent = data ? data.filter(r => r.month !== currentMonth).slice(-6) : []
  const avg = (sel: (r: TrendRow) => number) =>
    recent.length ? recent.reduce((s, r) => s + sel(r), 0) / recent.length : 0
  const avgRate    = Math.round(avg(r => r.savingsRate))
  const avgSaved   = avg(r => r.saved)
  const avgIncome  = avg(r => r.income)
  const avgExpense = avg(r => r.expenses)

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">

      <div className="mb-8">
        <p className="text-xs uppercase text-muted-foreground mb-2">
          {t("trends.label")}
        </p>
        <h1>
          {t("trends.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          {t("trends.intro")}
        </p>
      </div>

      {loading && (
        <PageLoading />
      )}

      {error && <div className="text-sm text-destructive py-20 text-center">{error}</div>}

      {data && !loading && data.length === 0 && (
        <p className="text-sm text-muted-foreground py-20 text-center">{t("trends.noData")}</p>
      )}

      {data && !loading && data.length > 0 && (
        <div className="space-y-4">

          {/* Trailing-6-month averages */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase text-muted-foreground mb-2">{t("trends.avgRate")}</p>
                <p className="font-display text-3xl text-info">{avgRate}%</p>
                <p className="text-xs text-muted-foreground mt-1">{t("trends.lastMonths", { count: recent.length })}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase text-muted-foreground mb-2">{t("trends.avgSaved")}</p>
                <p className="font-display text-3xl text-info">Fr. {fmtR(avgSaved)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("common.perMonth")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase text-muted-foreground mb-2">{t("trends.avgIncome")}</p>
                <p className="font-display text-3xl text-positive">Fr. {fmtR(avgIncome)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("common.perMonth")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase text-muted-foreground mb-2">{t("trends.avgExpenses")}</p>
                <p className="font-display text-3xl text-negative">Fr. {fmtR(avgExpense)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("common.perMonth")}</p>
              </CardContent>
            </Card>
          </div>

          {/* Cash flow + savings-rate line */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {t("trends.chart")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis yAxisId="chf" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={v => fmtR(Number(v))} />
                  <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={v => `${v}%`} />
                  <Tooltip
                    labelFormatter={label => fmtMonth(String(label))}
                    formatter={(value, name) =>
                      name === t("trends.savingsRate")
                        ? [`${value}%`, name]
                        : [`Fr. ${fmtR(Number(value))}`, name]
                    }
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "var(--card-foreground)",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar yAxisId="chf" dataKey="income"   name={t("dashboard.income")}   fill="#6aaa7a" radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="chf" dataKey="expenses" name={t("dashboard.expenses")} fill="#d4857a" radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="chf" dataKey="saved"    name={t("dashboard.saved")}    fill="#8ab4d4" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="pct" type="monotone" dataKey="savingsRate" name={t("trends.savingsRate")} stroke="var(--foreground)" strokeWidth={2} dot={{ r: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  )
}
