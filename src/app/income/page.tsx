"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
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
import { ALL_STREAM, type StreamAnalysis } from "@/lib/income"
import { StreamTrends, StreamsByYear } from "./stream-trends"
import { PageLoading } from "@/components/page-loading"
import { useT } from "@/lib/i18n/provider"

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

// Maps a selected year ("all" or "2026") to inclusive from/to month params.
const yearRange = (year: string): Record<string, string> =>
  year === "all" ? {} : { from: `${year}-01`, to: `${year}-12` }

export default function IncomePage() {
  const { t, f } = useT()
  const fmt = (n: number) => f.decimal(n)
  const fmtR = f.int
  // The aggregate and the no-category stream are named in English by the API.
  const label = (name: string) =>
    name === ALL_STREAM ? t("income.allIncome") : name === "Uncategorized" ? t("dashboard.uncategorized") : name
  const [data, setData]       = useState<IncomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // Year filter — "all" or a specific year. `years` is derived from the data.
  const [year, setYear]   = useState<string>("all")
  const [years, setYears] = useState<string[]>([])

  // Per-stream trends (full history, independent of the year filter).
  const [streams, setStreams]               = useState<StreamAnalysis[]>([])
  const [selectedStream, setSelectedStream] = useState<string>(ALL_STREAM)
  const trendsRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    fetch("/api/income/streams")
      .then(r => r.json())
      .then(d => setStreams(d.streams ?? []))
      .catch(() => setStreams([]))
  }, [])

  // Select a source in the trends card and bring it into view.
  function showTrend(name: string) {
    setSelectedStream(name)
    trendsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  // Changing the year keeps the current breakdown on screen, dimmed, until the
  // new one arrives (the spinner is for the first load only).
  function changeYear(y: string) {
    setYear(y)
    setLoading(true)
    setError(null)
  }

  // (Re)load the income breakdown whenever the year filter changes.
  useEffect(() => {
    const params = new URLSearchParams(yearRange(year))

    fetch(`/api/income?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(() => setError(t("dashboard.loadFailed")))
      .finally(() => setLoading(false))
    // Reloads per year; t is only read if loading fails.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <p className="text-xs uppercase text-muted-foreground mb-2">
            {t("nav.page.income")}
          </p>
          <h1>
            {t("income.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {year === "all" ? t("income.introAll") : t("income.introYear", { year })}
          </p>
        </div>

        <Select value={year} onValueChange={changeYear}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t("income.year")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("income.allYears")}</SelectItem>
            {years.map(y => (
              <SelectItem key={y} value={y}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && !data && <PageLoading />}

      {error && (
        <div className="text-sm text-destructive py-20 text-center">
          {t("dashboard.noDataHint", { error })}
          <br />
          <a href="/import" className="underline mt-2 inline-block">{t("dashboard.goToImport")}</a>
        </div>
      )}

      {data && data.byCategory.length === 0 && (
        <p className="text-sm text-muted-foreground py-20 text-center">
          {t("income.none")}
        </p>
      )}

      {data && data.byCategory.length > 0 && (
        <div className={`space-y-4 transition-opacity ${loading ? "opacity-60 delay-300" : ""}`} aria-busy={loading}>

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
                <p className="text-xs uppercase text-muted-foreground mb-2">
                  {t("income.total")}
                </p>
                <p className="font-display text-3xl text-positive">
                  Fr. {fmtR(data.total)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("income.viewAll")}
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
                // The tile is a block in the source's own colour (globals.css "Tiles").
                style={{ "--tile": c.color } as CSSProperties}
              >
                <CardContent className="pt-6">
                  <p className="text-xs uppercase text-muted-foreground mb-2 truncate">
                    {label(c.categoryName)}
                  </p>
                  <p className="font-display text-3xl">
                    Fr. {fmtR(c.total)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("income.shareCount", { share: c.share, count: c.count })}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {streams.length > 0 && (
            <>
              <StreamTrends
                ref={trendsRef}
                streams={streams}
                selected={selectedStream}
                onSelect={setSelectedStream}
                year={year}
                onShowPayments={name => openTransactions(name === ALL_STREAM ? null : name)}
              />
              <StreamsByYear streams={streams} selected={selectedStream} onSelect={setSelectedStream} />
            </>
          )}

          {/* Breakdown by source */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {t("income.bySource")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.byCategory.map(c => (
                  <button
                    key={c.categoryName}
                    type="button"
                    onClick={() => showTrend(c.categoryName)}
                    className="block w-full text-left rounded-md -mx-2 px-2 py-1 hover:bg-muted/60 transition-colors"
                    title={t("income.showTrend", { name: label(c.categoryName) })}
                  >
                    <div className="flex justify-between text-sm mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: c.color }} />
                        <span className="text-muted-foreground">{label(c.categoryName)}</span>
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
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Monthly trend (stacked by source) */}
          {data.byMonth.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  {t("income.perMonth")}
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
              {openSource === "__all__" ? t("income.allIncome") : label(openSource ?? "")}
            </DialogTitle>
            <DialogDescription>
              {txns
                ? t("income.dialog.count", { count: txns.length, amount: fmt(txns.reduce((sum, x) => sum + x.amount, 0)) })
                : t("dashboard.drill.loading")}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto">
            {txnsLoading && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground py-10 justify-center">
                <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                {t("common.loading")}
              </div>
            )}

            {!txnsLoading && txns && txns.length === 0 && (
              <p className="text-sm text-muted-foreground py-10 text-center">
                {t("dashboard.drill.none")}
              </p>
            )}

            {!txnsLoading && txns && txns.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("dashboard.drill.date")}</TableHead>
                    <TableHead>{t("dashboard.drill.counterparty")}</TableHead>
                    <TableHead>{t("income.dialog.account")}</TableHead>
                    <TableHead className="text-right">{t("dashboard.drill.amount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txns.map(row => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {f.date(row.date)}
                      </TableCell>
                      <TableCell>
                        <div>{row.counterparty}</div>
                        {row.bookingText && (
                          <div className="text-xs text-muted-foreground truncate max-w-[220px]">
                            {row.bookingText}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {row.account}
                      </TableCell>
                      <TableCell className="text-right font-mono whitespace-nowrap text-positive">
                        Fr. {fmt(row.amount)}
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
