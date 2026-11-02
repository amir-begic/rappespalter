"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageLoading } from "@/components/page-loading"
import type { TaxDividend } from "@/lib/tax"

interface TaxSummary {
  year:              number
  years:             number[]
  savingsCategories: { id: number; name: string; color: string }[]
  pillar3a: {
    category: { id: number; name: string }
    total:    number
    payments: { id: number; date: string; counterparty: string; amount: number }[]
  } | null
  income:   { name: string; color: string; total: number }[]
  snapshot: { month: string; etf: number; savings: number; pillar3a: number; pillar2: number; checking: number } | null
  portfolio: {
    asOf:      string
    hasData:   boolean
    holdings:  { symbol: string; name: string; units: number; price: number | null; priceCurrency: string; priceDate: string | null; priceIsTrade: boolean; value: number }[]
    cash:      number
    value:     number
    dividends: TaxDividend[]
    warnings:  string[]
  }
}

const fmt = (n: number) =>
  n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUnits = (n: number) => n.toLocaleString("de-CH", { maximumFractionDigits: 4 })
const fmtDate = (d: string) =>
  new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })
const fmtMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number)
  return new Date(y, mo - 1).toLocaleDateString("de-CH", { month: "long", year: "numeric" })
}

const selectClass = "text-sm rounded-xl border border-input px-3 py-2 bg-card text-foreground"

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-baseline justify-between gap-2">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
        {aside}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function Row({ label, value, strong }: { label: React.ReactNode; value: number; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 border-b border-border last:border-0 text-sm ${strong ? "font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="font-mono">Fr. {fmt(value)}</span>
    </div>
  )
}

export default function TaxPage() {
  const [data, setData]       = useState<TaxSummary | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery]     = useState<{ year?: number; pillar3a?: number }>({})

  useEffect(() => {
    const params = new URLSearchParams()
    if (query.year) params.set("year", String(query.year))
    if (query.pillar3a) params.set("pillar3a", String(query.pillar3a))
    let stale = false
    fetch(`/api/tax?${params}`)
      .then(r => r.json())
      .then(d => {
        if (stale) return
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(() => { if (!stale) setError("Failed to load the tax summary") })
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
  }, [query])

  const change = (q: typeof query) => { setLoading(true); setQuery(prev => ({ ...prev, ...q })) }

  const p = data?.portfolio
  const divTotals = p?.dividends.reduce((t, d) => ({
    gross: t.gross + d.grossChf, tax: t.tax + d.taxChf, net: t.net + d.netChf,
  }), { gross: 0, tax: 0, net: 0 })

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">

      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase text-muted-foreground mb-2">Planning</p>
          <h1>Tax return</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            What the app knows for one year&apos;s tax return, in one place. It doesn&apos;t apply tax
            rules — check the figures against your official documents (salary certificate, 3a and bank
            statements, the broker&apos;s tax report).
          </p>
        </div>
        {data && data.years.length > 0 && (
          <select
            value={data.year}
            onChange={e => change({ year: Number(e.target.value) })}
            aria-label="Tax year"
            className={selectClass}
          >
            {data.years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>

      {loading && !data && <PageLoading />}
      {error && <div className="text-sm text-destructive py-20 text-center">{error}</div>}

      {data && (
        <div className={`space-y-4 transition-opacity ${loading ? "opacity-60 delay-300" : ""}`} aria-busy={loading}>

          <Section
            title="Säule 3a contributions"
            aside={data.savingsCategories.length > 1 && (
              <select
                value={data.pillar3a?.category.id ?? ""}
                onChange={e => change({ pillar3a: Number(e.target.value) })}
                aria-label="Säule 3a category"
                className="text-xs rounded-lg border border-input px-2 py-1 bg-card text-foreground"
              >
                {data.savingsCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          >
            {!data.pillar3a ? (
              <p className="text-sm text-muted-foreground">No savings category for Säule 3a — add one on Data → Categories.</p>
            ) : (
              <>
                {/* Wrapped: a card leading with a .font-display figure becomes a coloured tile (globals.css). */}
                <div><p className="font-display text-3xl">Fr. {fmt(data.pillar3a.total)}</p></div>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  {data.pillar3a.payments.length} payment{data.pillar3a.payments.length === 1 ? "" : "s"} categorized
                  as {data.pillar3a.category.name} in {data.year}. The deductible maximum is set each year — compare
                  with your 3a provider&apos;s certificate.
                </p>
                {data.pillar3a.payments.length > 0 && (
                  <ul className="divide-y divide-border text-xs">
                    {data.pillar3a.payments.map(t => (
                      <li key={t.id} className="flex items-center gap-3 py-1.5">
                        <span className="w-24 shrink-0 text-muted-foreground">{fmtDate(t.date)}</span>
                        <span className="min-w-0 flex-1 truncate">{t.counterparty}</span>
                        <span className="font-mono">Fr. {fmt(-t.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Section>

          <Section title={`Balances at the end of ${data.year}`}>
            {!data.snapshot ? (
              <p className="text-sm text-muted-foreground">
                No snapshot from December {data.year} or January {data.year + 1}. Record your balances on
                Projections to have them here.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-2">From your {fmtMonth(data.snapshot.month)} snapshot.</p>
                <Row label="Checking account" value={data.snapshot.checking} />
                <Row label="Savings account"  value={data.snapshot.savings} />
                <Row label="ETF portfolio"    value={data.snapshot.etf} />
                <Row label="Säule 3a"         value={data.snapshot.pillar3a} />
                <Row label="2. Säule"         value={data.snapshot.pillar2} />
                <p className="text-xs text-muted-foreground mt-2">
                  3a and 2. Säule aren&apos;t taxed as wealth; they&apos;re listed for completeness.
                </p>
              </>
            )}
          </Section>

          <Section title={`Securities on ${fmtDate(p!.asOf)}`}>
            {!p!.hasData ? (
              <p className="text-sm text-muted-foreground">No broker activity up to then — import your Yuh activities on Portfolio.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="pb-2 text-left font-normal">Security</th>
                        <th className="pb-2 text-right font-normal">Units</th>
                        <th className="pb-2 text-right font-normal">Price</th>
                        <th className="pb-2 text-right font-normal">Value (CHF)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p!.holdings.map(h => (
                        <tr key={h.symbol} className="border-b border-border">
                          <td className="py-2 pr-3">
                            <span className="block truncate max-w-[18rem]">{h.name}</span>
                            <span className="text-xs text-muted-foreground font-mono">{h.symbol}</span>
                          </td>
                          <td className="py-2 text-right font-mono">{fmtUnits(h.units)}</td>
                          <td className="py-2 text-right font-mono text-xs">
                            {h.price == null ? "—" : `${h.priceCurrency} ${fmt(h.price)}`}
                            {h.priceDate && <span className="block text-muted-foreground">{h.priceIsTrade ? "last trade" : fmtDate(h.priceDate)}</span>}
                          </td>
                          <td className="py-2 text-right font-mono">{fmt(h.value)}</td>
                        </tr>
                      ))}
                      <tr className="border-b border-border">
                        <td className="py-2 text-muted-foreground" colSpan={3}>Cash at the broker</td>
                        <td className="py-2 text-right font-mono">{fmt(p!.cash)}</td>
                      </tr>
                      <tr className="font-semibold">
                        <td className="pt-2" colSpan={3}>Total</td>
                        <td className="pt-2 text-right font-mono">{fmt(p!.value)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Closing prices on or before that day, converted at the ECB rate. The tax office values
                  securities with its own year-end prices (ESTV list), so expect small differences.
                </p>
              </>
            )}
            {p!.warnings.length > 0 && <p className="text-xs text-negative mt-2">{p!.warnings.join(" · ")}</p>}
          </Section>

          <Section title={`Dividends in ${data.year}`}>
            {p!.dividends.length === 0 ? (
              <p className="text-sm text-muted-foreground">No dividends booked in {data.year}.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="pb-2 text-left font-normal">Security</th>
                        <th className="pb-2 text-right font-normal">Gross</th>
                        <th className="pb-2 text-right font-normal">Withholding tax</th>
                        <th className="pb-2 text-right font-normal">Gross (CHF)</th>
                        <th className="pb-2 text-right font-normal">Withheld (CHF)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p!.dividends.map(d => (
                        <tr key={d.symbol} className="border-b border-border">
                          <td className="py-2 pr-3">
                            <span className="block truncate max-w-[14rem]">{d.name}</span>
                            <span className="text-xs text-muted-foreground">{d.payments} payment{d.payments === 1 ? "" : "s"}</span>
                          </td>
                          <td className="py-2 text-right font-mono text-xs">{d.currency} {fmt(d.gross)}</td>
                          <td className="py-2 text-right font-mono text-xs">{d.currency} {fmt(d.tax)}</td>
                          <td className="py-2 text-right font-mono">{fmt(d.grossChf)}</td>
                          <td className="py-2 text-right font-mono">{fmt(d.taxChf)}</td>
                        </tr>
                      ))}
                      <tr className="font-semibold">
                        <td className="pt-2" colSpan={3}>Total</td>
                        <td className="pt-2 text-right font-mono">{fmt(divTotals!.gross)}</td>
                        <td className="pt-2 text-right font-mono">{fmt(divTotals!.tax)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Gross dividends are taxable income. Withholding tax can partly be reclaimed or credited
                  through the tax return, depending on where the security is domiciled — the broker&apos;s
                  tax report has the details. CHF at each payment day&apos;s ECB rate.
                </p>
              </>
            )}
          </Section>

          <Section title={`Income booked in ${data.year}`}>
            {data.income.length === 0 ? (
              <p className="text-sm text-muted-foreground">No income in {data.year}.</p>
            ) : (
              <>
                {data.income.map(r => (
                  <Row
                    key={r.name}
                    label={<span className="flex items-center gap-2"><span className="size-2 rounded-sm" style={{ background: r.color }} />{r.name}</span>}
                    value={r.total}
                  />
                ))}
                <Row label="Total" value={data.income.reduce((s, r) => s + r.total, 0)} strong />
                <p className="text-xs text-muted-foreground mt-2">
                  Money in by category, excluding transfers. Your salary certificate is what counts for
                  employment income; this is a cross-check, and shows other income to declare.
                </p>
              </>
            )}
          </Section>

        </div>
      )}
    </div>
  )
}
