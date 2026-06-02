"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"

interface IncomeData {
  total: number
  byCategory: {
    categoryName: string
    color:        string
    type:         string
    total:        number
    count:        number
    share:        number
  }[]
  byMonth: ({ month: string; total: number } & Record<string, number>)[]
  series: { name: string; color: string }[]
}

interface Txn {
  id:           number
  date:         string
  counterparty: string
  amount:       number
  account:      string
  bookingText:  string | null
  category:     { name: string; color: string } | null
}

const fmt = (n: number) =>
  n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtR = (n: number) =>
  Math.round(n).toLocaleString("de-CH")

// Maps a selected year ("all" or "2026") to inclusive from/to month params.
const yearRange = (year: string): Record<string, string> =>
  year === "all" ? {} : { from: `${year}-01`, to: `${year}-12` }

export default function IncomePage() {
  const [data, setData]       = useState<IncomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // Year filter — "all" or a specific year. `years` is derived from the data.
  const [year, setYear]   = useState<string>("all")
  const [years, setYears] = useState<string[]>([])

  // Drill-down dialog: which income source is open, and its transactions.
  const [openSource, setOpenSource] = useState<string | null>(null)
  const [txns, setTxns]             = useState<Txn[] | null>(null)
  const [txnsLoading, setTxnsLoading] = useState(false)

  // Build the list of available years once, from all recorded months.
  useEffect(() => {
    fetch("/api/months")
      .then(r => r.json())
      .then(d => {
        const ys = Array.from(new Set<string>((d.months ?? []).map((m: string) => m.slice(0, 4))))
        setYears(ys.sort((a, b) => b.localeCompare(a)))
      })
      .catch(() => setYears([]))
  }, [])

  // (Re)load the income breakdown whenever the year filter changes.
  useEffect(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams(yearRange(year))

    fetch(`/api/income?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(() => setError("Failed to load data"))
      .finally(() => setLoading(false))
  }, [year])

  // `source` is a category name, or null for "all income".
  function openTransactions(source: string | null) {
    setOpenSource(source ?? "__all__")
    setTxns(null)
    setTxnsLoading(true)

    const params = new URLSearchParams({ type: "income", limit: "1000", ...yearRange(year) })
    // The income API labels null-category rows "Uncategorized"; the transactions
    // API filters those via the "__uncategorized__" sentinel.
    if (source) params.set("category", source === "Uncategorized" ? "__uncategorized__" : source)

    fetch(`/api/transactions?${params}`)
      .then(r => r.json())
      .then(d => setTxns(d.transactions ?? []))
      .catch(() => setTxns([]))
      .finally(() => setTxnsLoading(false))
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">

      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-widest uppercase text-muted-foreground mb-2">
            Income
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Income by Source
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {year === "all"
              ? "Every incoming payment, broken down by category across all recorded months."
              : `Incoming payments for ${year}, broken down by category.`}
          </p>
        </div>

        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            {years.map(y => (
              <SelectItem key={y} value={y}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground py-20 justify-center">
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Loading...
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive py-20 text-center">
          {error} — have you imported any transactions yet?
          <br />
          <a href="/import" className="underline mt-2 inline-block">Go to import</a>
        </div>
      )}

      {data && !loading && data.byCategory.length === 0 && (
        <p className="text-sm text-muted-foreground py-20 text-center">
          No income recorded yet.
        </p>
      )}

      {data && !loading && data.byCategory.length > 0 && (
        <div className="space-y-4">

          {/* Total + per-source stat cards — click to drill into transactions */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card
              role="button"
              tabIndex={0}
              onClick={() => openTransactions(null)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTransactions(null) } }}
              className="cursor-pointer transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CardContent className="pt-6">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                  Total income
                </p>
                <p className="text-2xl font-semibold text-green-600">
                  Fr. {fmtR(data.total)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  View all transactions
                </p>
              </CardContent>
            </Card>
            {data.byCategory.slice(0, 3).map(c => (
              <Card
                key={c.categoryName}
                role="button"
                tabIndex={0}
                onClick={() => openTransactions(c.categoryName)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTransactions(c.categoryName) } }}
                className="cursor-pointer transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CardContent className="pt-6">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2 truncate">
                    {c.categoryName}
                  </p>
                  <p className="text-2xl font-semibold" style={{ color: c.color }}>
                    Fr. {fmtR(c.total)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {c.share}% · {c.count} payment{c.count === 1 ? "" : "s"}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Breakdown by source */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                By source
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.byCategory.map(c => (
                  <div key={c.categoryName}>
                    <div className="flex justify-between text-sm mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: c.color }} />
                        <span className="text-muted-foreground">{c.categoryName}</span>
                        <span className="text-xs text-muted-foreground">· {c.count}×</span>
                      </div>
                      <span className="font-mono">Fr. {fmt(c.total)}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${c.share}%`, background: c.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Monthly trend (stacked by source) */}
          {data.byMonth.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Monthly trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.byMonth} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={(v) => fmtR(Number(v))} />
                    <Tooltip
                      formatter={(value, name) => [`Fr. ${fmt(Number(value))}`, name]}
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        color: "var(--card-foreground)",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    {data.series.map((s, i) => (
                      <Bar
                        key={s.name}
                        dataKey={s.name}
                        stackId="income"
                        fill={s.color}
                        radius={i === data.series.length - 1 ? [3, 3, 0, 0] : undefined}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

        </div>
      )}

      {/* Drill-down: all tracked transactions for the clicked income source */}
      <Dialog open={openSource !== null} onOpenChange={o => { if (!o) setOpenSource(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {openSource === "__all__" ? "All income" : openSource}
            </DialogTitle>
            <DialogDescription>
              {txns
                ? `${txns.length} tracked transaction${txns.length === 1 ? "" : "s"} · Fr. ${fmt(txns.reduce((s, t) => s + t.amount, 0))}`
                : "Loading transactions…"}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto">
            {txnsLoading && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground py-10 justify-center">
                <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                Loading...
              </div>
            )}

            {!txnsLoading && txns && txns.length === 0 && (
              <p className="text-sm text-muted-foreground py-10 text-center">
                No transactions found.
              </p>
            )}

            {!txnsLoading && txns && txns.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Counterparty</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txns.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {new Date(t.date).toLocaleDateString("de-CH")}
                      </TableCell>
                      <TableCell>
                        <div>{t.counterparty}</div>
                        {t.bookingText && (
                          <div className="text-xs text-muted-foreground truncate max-w-[220px]">
                            {t.bookingText}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {t.account}
                      </TableCell>
                      <TableCell className="text-right font-mono whitespace-nowrap text-green-600">
                        Fr. {fmt(t.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
