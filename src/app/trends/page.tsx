"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"

interface TrendRow {
  month:       string
  income:      number
  expenses:    number
  saved:       number
  liquidSaved: number
  net:         number
  savingsRate: number
}

const fmtR = (n: number) => Math.round(n).toLocaleString("de-CH")
const fmtMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number)
  return new Date(y, mo - 1).toLocaleDateString("de-CH", { month: "short", year: "2-digit" })
}

export default function TrendsPage() {
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
      .catch(() => setError("Failed to load data"))
      .finally(() => setLoading(false))
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
        <p className="text-xs tracking-widest uppercase text-muted-foreground mb-2">
          Trends
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Income, Spending &amp; Savings Rate
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Month-over-month cash flow and the share of income you keep — the habit that decides when you can buy.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground py-20 justify-center">
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Loading...
        </div>
      )}

      {error && <div className="text-sm text-destructive py-20 text-center">{error}</div>}

      {data && !loading && data.length === 0 && (
        <p className="text-sm text-muted-foreground py-20 text-center">No transactions recorded yet.</p>
      )}

      {data && !loading && data.length > 0 && (
        <div className="space-y-4">

          {/* Trailing-6-month averages */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Avg savings rate</p>
                <p className="text-2xl font-semibold text-blue-400">{avgRate}%</p>
                <p className="text-xs text-muted-foreground mt-1">last {recent.length} mo</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Avg saved</p>
                <p className="text-2xl font-semibold text-blue-400">Fr. {fmtR(avgSaved)}</p>
                <p className="text-xs text-muted-foreground mt-1">per month</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Avg income</p>
                <p className="text-2xl font-semibold text-green-600">Fr. {fmtR(avgIncome)}</p>
                <p className="text-xs text-muted-foreground mt-1">per month</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Avg expenses</p>
                <p className="text-2xl font-semibold text-red-400">Fr. {fmtR(avgExpense)}</p>
                <p className="text-xs text-muted-foreground mt-1">per month</p>
              </CardContent>
            </Card>
          </div>

          {/* Cash flow + savings-rate line */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Monthly cash flow &amp; savings rate
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
                      name === "Savings rate"
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
                  <Bar yAxisId="chf" dataKey="income"   name="Income"   fill="#6aaa7a" radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="chf" dataKey="expenses" name="Expenses" fill="#d4857a" radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="chf" dataKey="saved"    name="Saved"    fill="#8ab4d4" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="pct" type="monotone" dataKey="savingsRate" name="Savings rate" stroke="var(--foreground)" strokeWidth={2} dot={{ r: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  )
}
