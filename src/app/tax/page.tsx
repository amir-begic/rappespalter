"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageLoading } from "@/components/page-loading"
import type { TaxDividend } from "@/lib/tax"
import type { PortfolioWarning } from "@/lib/portfolio/engine"
import { warningText } from "@/lib/i18n/labels"
import { useT } from "@/lib/i18n/provider"

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
    warnings:  PortfolioWarning[]
  }
}

// Number and date writing in the current language.
function useFormats() {
  const { f, locale } = useT()
  return {
    fmt: (n: number) => f.decimal(n),
    fmtUnits: (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 4 }),
    fmtDate: (d: string) => f.date(d.length === 10 ? d + "T00:00:00" : d, { day: "2-digit", month: "2-digit", year: "numeric" }),
    fmtMonth: f.monthLong,
  }
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
  const { fmt } = useFormats()
  return (
    <div className={`flex items-center justify-between py-2 border-b border-border last:border-0 text-sm ${strong ? "font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="font-mono">Fr. {fmt(value)}</span>
    </div>
  )
}

export default function TaxPage() {
  const { t } = useT()
  const { fmt, fmtUnits, fmtDate, fmtMonth } = useFormats()
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
      .catch(() => { if (!stale) setError(t("tax.loadFailed")) })
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
    // Reloads per query; t is only read if loading fails.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const change = (q: typeof query) => { setLoading(true); setQuery(prev => ({ ...prev, ...q })) }

  const p = data?.portfolio
  const divTotals = p?.dividends.reduce((acc, d) => ({
    gross: acc.gross + d.grossChf, tax: acc.tax + d.taxChf, net: acc.net + d.netChf,
  }), { gross: 0, tax: 0, net: 0 })

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">

      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase text-muted-foreground mb-2">{t("nav.section.planning")}</p>
          <h1>{t("tax.title")}</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            {t("tax.intro")}
          </p>
        </div>
        {data && data.years.length > 0 && (
          <select
            value={data.year}
            onChange={e => change({ year: Number(e.target.value) })}
            aria-label={t("tax.yearAria")}
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
            title={t("tax.p3a.title")}
            aside={data.savingsCategories.length > 1 && (
              <select
                value={data.pillar3a?.category.id ?? ""}
                onChange={e => change({ pillar3a: Number(e.target.value) })}
                aria-label={t("tax.p3a.categoryAria")}
                className="text-xs rounded-lg border border-input px-2 py-1 bg-card text-foreground"
              >
                {data.savingsCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          >
            {!data.pillar3a ? (
              <p className="text-sm text-muted-foreground">{t("tax.p3a.none")}</p>
            ) : (
              <>
                {/* Wrapped: a card leading with a .font-display figure becomes a coloured tile (globals.css). */}
                <div><p className="font-display text-3xl">Fr. {fmt(data.pillar3a.total)}</p></div>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  {t("tax.p3a.note", { count: data.pillar3a.payments.length, category: data.pillar3a.category.name, year: data.year })}
                </p>
                {data.pillar3a.payments.length > 0 && (
                  <ul className="divide-y divide-border text-xs">
                    {data.pillar3a.payments.map(pay => (
                      <li key={pay.id} className="flex items-center gap-3 py-1.5">
                        <span className="w-24 shrink-0 text-muted-foreground">{fmtDate(pay.date)}</span>
                        <span className="min-w-0 flex-1 truncate">{pay.counterparty}</span>
                        <span className="font-mono">Fr. {fmt(-pay.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Section>

          <Section title={t("tax.balances.title", { year: data.year })}>
            {!data.snapshot ? (
              <p className="text-sm text-muted-foreground">
                {t("tax.balances.none", { year: data.year, next: data.year + 1 })}
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-2">{t("tax.balances.from", { month: fmtMonth(data.snapshot.month) })}</p>
                <Row label={t("welcome.balances.checking")} value={data.snapshot.checking} />
                <Row label={t("welcome.balances.savings")}  value={data.snapshot.savings} />
                <Row label={t("welcome.balances.etf")}      value={data.snapshot.etf} />
                <Row label={t("welcome.balances.pillar3a")} value={data.snapshot.pillar3a} />
                <Row label={t("welcome.balances.pillar2")}  value={data.snapshot.pillar2} />
                <p className="text-xs text-muted-foreground mt-2">
                  {t("tax.balances.note")}
                </p>
              </>
            )}
          </Section>

          <Section title={t("tax.securities.title", { date: fmtDate(p!.asOf) })}>
            {!p!.hasData ? (
              <p className="text-sm text-muted-foreground">{t("tax.securities.none")}</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="pb-2 text-left font-normal">{t("tax.securities.security")}</th>
                        <th className="pb-2 text-right font-normal">{t("tax.securities.units")}</th>
                        <th className="pb-2 text-right font-normal">{t("tax.securities.price")}</th>
                        <th className="pb-2 text-right font-normal">{t("tax.securities.value")}</th>
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
                            {h.priceDate && <span className="block text-muted-foreground">{h.priceIsTrade ? t("tax.securities.lastTrade") : fmtDate(h.priceDate)}</span>}
                          </td>
                          <td className="py-2 text-right font-mono">{fmt(h.value)}</td>
                        </tr>
                      ))}
                      <tr className="border-b border-border">
                        <td className="py-2 text-muted-foreground" colSpan={3}>{t("tax.securities.cash")}</td>
                        <td className="py-2 text-right font-mono">{fmt(p!.cash)}</td>
                      </tr>
                      <tr className="font-semibold">
                        <td className="pt-2" colSpan={3}>{t("tax.securities.total")}</td>
                        <td className="pt-2 text-right font-mono">{fmt(p!.value)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {t("tax.securities.note")}
                </p>
              </>
            )}
            {p!.warnings.length > 0 && <p className="text-xs text-negative mt-2">{p!.warnings.map(w => warningText(t, w)).join(" · ")}</p>}
          </Section>

          <Section title={t("tax.dividends.title", { year: data.year })}>
            {p!.dividends.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("tax.dividends.none", { year: data.year })}</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="pb-2 text-left font-normal">{t("tax.securities.security")}</th>
                        <th className="pb-2 text-right font-normal">{t("tax.dividends.gross")}</th>
                        <th className="pb-2 text-right font-normal">{t("tax.dividends.withholding")}</th>
                        <th className="pb-2 text-right font-normal">{t("tax.dividends.grossChf")}</th>
                        <th className="pb-2 text-right font-normal">{t("tax.dividends.withheldChf")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p!.dividends.map(d => (
                        <tr key={d.symbol} className="border-b border-border">
                          <td className="py-2 pr-3">
                            <span className="block truncate max-w-[14rem]">{d.name}</span>
                            <span className="text-xs text-muted-foreground">{t("recurring.payments", { count: d.payments })}</span>
                          </td>
                          <td className="py-2 text-right font-mono text-xs">{d.currency} {fmt(d.gross)}</td>
                          <td className="py-2 text-right font-mono text-xs">{d.currency} {fmt(d.tax)}</td>
                          <td className="py-2 text-right font-mono">{fmt(d.grossChf)}</td>
                          <td className="py-2 text-right font-mono">{fmt(d.taxChf)}</td>
                        </tr>
                      ))}
                      <tr className="font-semibold">
                        <td className="pt-2" colSpan={3}>{t("tax.securities.total")}</td>
                        <td className="pt-2 text-right font-mono">{fmt(divTotals!.gross)}</td>
                        <td className="pt-2 text-right font-mono">{fmt(divTotals!.tax)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {t("tax.dividends.note")}
                </p>
              </>
            )}
          </Section>

          <Section title={t("tax.income.title", { year: data.year })}>
            {data.income.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("tax.income.none", { year: data.year })}</p>
            ) : (
              <>
                {data.income.map(r => (
                  <Row
                    key={r.name}
                    label={<span className="flex items-center gap-2"><span className="size-2 rounded-sm" style={{ background: r.color }} />{r.name}</span>}
                    value={r.total}
                  />
                ))}
                <Row label={t("tax.securities.total")} value={data.income.reduce((s, r) => s + r.total, 0)} strong />
                <p className="text-xs text-muted-foreground mt-2">
                  {t("tax.income.note")}
                </p>
              </>
            )}
          </Section>

        </div>
      )}
    </div>
  )
}
