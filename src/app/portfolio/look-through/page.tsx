"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Upload } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { LookThroughSummary } from "@/lib/portfolio/store"
import { PageLoading } from "@/components/page-loading"
import { useT } from "@/lib/i18n/provider"

// ── Formatting ──────────────────────────────────────────────────────────────

// Number, date and country / currency names in the current language.
function useFormats() {
  const { f, locale } = useT()
  const names = (type: "region" | "currency") => typeof Intl !== "undefined" ? new Intl.DisplayNames([locale], { type }) : null
  const regionNames = names("region")
  const currencyNames = names("currency")
  return {
    fmtR: f.int,
    fmt2: (n: number) => f.decimal(n),
    fmtPct: (n: number | null, digits = 2) => n == null ? "—" : `${(n * 100).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`,
    fmtCount: (n: number) => n.toLocaleString(locale),
    dayLabel: (d: string) => f.date(d + "T00:00:00Z", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
    currencyName: (code: string) => {
      if (code === "Unknown") return code
      try { return `${code} · ${currencyNames?.of(code) ?? code}` } catch { return code }
    },
    countryName: (code: string) => {
      if (code === "Unknown") return code
      try { return regionNames?.of(code) ?? code } catch { return code }
    },
  }
}

const PAGE = 20
const BARS = 12

type Fund = LookThroughSummary["funds"][number]
type Breakdown = "countries" | "sectors" | "currencies"

// ── Page ────────────────────────────────────────────────────────────────────

export default function LookThroughPage() {
  const { t, rich } = useT()
  const { fmtR, fmt2, fmtPct, fmtCount, countryName, currencyName } = useFormats()
  const [data, setData]     = useState<LookThroughSummary | null>(null)
  const [error, setError]   = useState<string | null>(null)
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "warn" } | null>(null)
  const [query, setQuery]   = useState("")
  const [shown, setShown]   = useState(PAGE)
  const [breakdown, setBreakdown] = useState<Breakdown>("countries")

  const load = useCallback(async () => {
    const res = await fetch("/api/portfolio/lookthrough")
    const d = await res.json()
    if (!res.ok) throw new Error(d.error ?? t("lt.loadFailed"))
    return d as LookThroughSummary
  }, [t])

  useEffect(() => {
    load().then(setData).catch(e => setError(e.message))
  }, [load])

  const companies = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = (data?.companies ?? []).map((c, i) => ({ ...c, rank: i + 1 }))
    return q ? all.filter(c => c.name.toLowerCase().includes(q)) : all
  }, [data, query])

  const fundsWithData = data?.funds.filter(f => f.source) ?? []
  const coverage = data && data.total > 0 ? data.lookedThrough / data.total : null

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <Link href="/portfolio" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="size-4" /> {t("nav.page.portfolio")}
      </Link>

      <div className="mb-8">
        <p className="text-xs uppercase text-muted-foreground mb-2">{t("nav.page.portfolio")}</p>
        <h1>{t("pf.lookThrough")}</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          {t("lt.intro")}
        </p>
      </div>

      {notice && (
        <div className={`mb-4 rounded-lg border px-4 py-2.5 text-sm ${
          notice.tone === "ok" ? "border-positive/30 bg-positive/10" : "border-highlight/40 bg-highlight/10"
        }`}>
          {notice.text}
        </div>
      )}

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !data ? (
        <PageLoading />
      ) : data.total === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <p>{t("lt.noInvestments")}</p>
            <p className="text-sm text-muted-foreground">
              {rich("lt.noInvestmentsText", { link: text => <Link href="/portfolio" className="underline">{text}</Link> })}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t("lt.stat.securities")}>
              <p className="font-display text-3xl">Fr. {fmtR(data.total)}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("lt.stat.securitiesSub")}</p>
            </Stat>
            <Stat label={t("lt.stat.looked")}>
              <p className="font-display text-3xl">{fmtPct(coverage, 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {data.notLookedThrough.length
                  ? t("lt.stat.lookedMissing", { symbols: data.notLookedThrough.map(fund => fund.symbol).join(", ") })
                  : t("lt.stat.lookedFunds", { count: fundsWithData.length })}
              </p>
            </Stat>
            <Stat label={t("lt.stat.companies")}>
              <p className="font-display text-3xl">{fmtCount(data.companies.length)}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("lt.stat.companiesSub", { count: data.countries.length })}</p>
            </Stat>
            <Stat label={t("lt.stat.top10")}>
              <p className="font-display text-3xl">{fmtPct(data.top10Share, 1)}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("lt.stat.top10Sub")}</p>
            </Stat>
          </div>

          {/* Companies */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm text-muted-foreground">{t("lt.companies.title")}</CardTitle>
              <Input
                aria-label={t("lt.companies.filterAria")}
                placeholder={t("lt.companies.find")}
                value={query}
                onChange={e => { setQuery(e.target.value); setShown(PAGE) }}
                className="h-8 w-56 text-sm"
              />
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {companies.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  {data.companies.length ? t("lt.companies.noMatch") : t("lt.companies.empty")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-right">#</TableHead>
                      <TableHead>{t("lt.companies.company")}</TableHead>
                      <TableHead className="text-right">{t("lt.companies.value")}</TableHead>
                      <TableHead className="text-right">{t("lt.companies.share")}</TableHead>
                      <TableHead>{t("lt.companies.via")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companies.slice(0, shown).map(c => (
                      <TableRow key={`${c.rank}`}>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">{c.rank}</TableCell>
                        <TableCell className="max-w-72">
                          <p className="truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[c.country && countryName(c.country), c.sector].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </TableCell>
                        <TableCell className="text-right font-mono">{c.value >= 10 ? fmtR(c.value) : fmt2(c.value)}</TableCell>
                        <TableCell className="text-right font-mono">{fmtPct(c.share, c.share >= 0.001 ? 2 : 3)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {c.via.map(v => (
                            <span key={v.symbol} className="mr-2" title={`Fr. ${fmt2(v.value)}`}>
                              <span className="font-mono text-foreground">{v.symbol}</span>
                              {c.via.length > 1 && ` ${Math.round(v.value / c.value * 100)}%`}
                            </span>
                          ))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                <p className="text-xs text-muted-foreground">
                  {t("lt.companies.showing", { shown: fmtCount(Math.min(shown, companies.length)), total: fmtCount(companies.length) })}
                </p>
                {shown < companies.length && (
                  <Button size="sm" variant="outline" onClick={() => setShown(s => s + PAGE * 2)}>{t("lt.companies.showMore")}</Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Countries / sectors */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm text-muted-foreground">
                {breakdown === "countries" ? t("lt.by.country") : breakdown === "sectors" ? t("lt.by.sector") : t("lt.by.currency")}
              </CardTitle>
              <Tabs value={breakdown} onValueChange={v => setBreakdown(v as Breakdown)}>
                <TabsList>
                  <TabsTrigger value="countries">{t("lt.tab.countries")}</TabsTrigger>
                  <TabsTrigger value="sectors">{t("lt.tab.sectors")}</TabsTrigger>
                  <TabsTrigger value="currencies">{t("lt.tab.currencies")}</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent>
              <BarList
                rows={breakdown === "countries"
                  ? data.countries.map(b => ({ ...b, label: countryName(b.key) }))
                  : breakdown === "sectors"
                    ? data.sectors.map(b => ({ ...b, label: b.key }))
                    : data.currencies.map(b => ({ ...b, label: currencyName(b.key) }))}
                extra={[
                  { label: t("lt.cashOther"), value: data.cashOther },
                  ...data.notLookedThrough.map(fund => ({ label: t("lt.noHoldingsFor", { symbol: fund.symbol }), value: fund.value })),
                ].filter(r => r.value >= 0.5).map(r => ({ ...r, share: r.value / data.total }))}
              />
              <p className="text-xs text-muted-foreground mt-3">
                {breakdown === "countries"
                  ? t("lt.note.countries")
                  : breakdown === "sectors"
                    ? t("lt.note.sectors")
                    : `${t("lt.note.currencies")}${data.currencyEstimatedShare >= 0.005
                      ? ` ${t("lt.note.currenciesEstimated", { pct: fmtPct(data.currencyEstimatedShare, 0) })}`
                      : ""}`}
              </p>
            </CardContent>
          </Card>

          {/* Data sources */}
          <Sources funds={data.funds} onChanged={async (text, tone = "ok") => {
            setNotice({ text, tone })
            setData(await load())
          }} />

          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl pb-4">
            {t("lt.footer")}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Ranked bars ─────────────────────────────────────────────────────────────

type BarRow = { label: string; value: number; share: number }

function BarList({ rows, extra }: { rows: BarRow[]; extra: BarRow[] }) {
  const { t } = useT()
  const { fmtR, fmtPct } = useFormats()
  const top = rows.slice(0, BARS)
  const rest = rows.slice(BARS)
  const list = rest.length
    ? [...top, { label: t("lt.more", { count: rest.length }), value: rest.reduce((s, r) => s + r.value, 0), share: rest.reduce((s, r) => s + r.share, 0) }]
    : top
  const max = Math.max(...list.map(r => r.share), ...extra.map(r => r.share), 0.0001)

  const bar = (r: BarRow, muted = false) => (
    <li key={r.label} className="grid grid-cols-[minmax(7rem,12rem)_1fr_5.5rem] items-center gap-3 text-sm" title={`Fr. ${fmtR(r.value)}`}>
      <span className={`truncate ${muted ? "text-muted-foreground" : ""}`}>{r.label}</span>
      <span className="h-3 rounded-r bg-muted/60">
        <span
          className={`block h-full rounded-r ${muted ? "bg-muted-foreground/40" : "bg-chart-2"}`}
          style={{ width: `${Math.max(0.5, (r.share / max) * 100)}%` }}
        />
      </span>
      <span className="text-right font-mono text-xs">{fmtPct(r.share, 1)}</span>
    </li>
  )

  if (!list.length) return <p className="text-sm text-muted-foreground">{t("lt.noData")}</p>
  return (
    <ul className="space-y-1.5">
      {list.map(r => bar(r))}
      {extra.length > 0 && <li className="border-t border-border pt-1.5" aria-hidden />}
      {extra.map(r => bar(r, true))}
    </ul>
  )
}

// ── Data sources ────────────────────────────────────────────────────────────

function Sources({ funds, onChanged }: {
  funds: Fund[]
  onChanged: (text: string, tone?: "ok" | "warn") => Promise<void>
}) {
  const { t, rich } = useT()
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{t("lt.src.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">
          {rich("lt.src.text", { em: text => <em>{text}</em> })}
        </p>
        {funds.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("lt.src.none")}</p>
        ) : (
          <div className="divide-y divide-border">
            {funds.map(f => <FundRow key={f.symbol} fund={f} onChanged={onChanged} />)}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function FundRow({ fund, onChanged }: {
  fund: Fund
  onChanged: (text: string, tone?: "ok" | "warn") => Promise<void>
}) {
  const { t } = useT()
  const { fmtR, fmtCount, dayLabel } = useFormats()
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)
  const s = fund.source
  const inputId = `holdings-file-${fund.symbol}`

  async function upload(file: File) {
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("symbol", fund.symbol)
      const res = await fetch("/api/portfolio/lookthrough", { method: "POST", body: form })
      const r = await res.json()
      if (!res.ok) throw new Error(r.error ?? t("lt.src.uploadFailed"))
      await onChanged(t(r.auto ? "lt.src.uploadedAuto" : "lt.src.uploaded", { symbol: fund.symbol, rows: fmtCount(r.rows), provider: r.provider, date: dayLabel(r.asOf) }))
    } catch (e) {
      setError(e instanceof Error ? e.message : t("lt.src.uploadFailed"))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(t("lt.src.removeConfirm", { symbol: fund.symbol }))) return
    setBusy(true)
    try {
      const res = await fetch(`/api/portfolio/lookthrough?symbol=${encodeURIComponent(fund.symbol)}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error ?? t("pf.deleteFailed"))
      await onChanged(t("lt.src.removed", { symbol: fund.symbol }))
    } catch (e) {
      setError(e instanceof Error ? e.message : t("pf.deleteFailed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="py-3 first:pt-0 last:pb-0 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm">{fund.symbol}</span>
        <span className="text-sm text-muted-foreground truncate">{fund.name}</span>
        <span className="text-xs text-muted-foreground">Fr. {fmtR(fund.value)}</span>
        {s ? (
          <>
            <Badge variant="outline">{t("lt.src.asOf", { provider: s.provider, date: dayLabel(s.asOf) })}</Badge>
            {s.auto && <Badge variant="secondary">{t("lt.src.auto")}</Badge>}
            {s.stale && <Badge variant="outline" className="border-highlight/50 text-highlight">{t("lt.src.stale", { days: s.ageDays })}</Badge>}
          </>
        ) : (
          <Badge variant="outline" className="border-highlight/50 text-highlight">{t("lt.src.noData")}</Badge>
        )}
        <div className="flex items-center gap-1 sm:ml-auto">
          <input
            id={inputId} type="file" accept=".csv,.xlsx,text/csv" className="hidden" disabled={busy}
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f) }}
          />
          <Button size="sm" variant="outline" disabled={busy} asChild>
            <label htmlFor={inputId} className="cursor-pointer"><Upload /> {s ? t("lt.src.replace") : t("lt.src.upload")}</label>
          </Button>
          {s && <Button size="sm" variant="ghost" disabled={busy} onClick={remove}>{t("lt.src.remove")}</Button>}
        </div>
      </div>
      {s && (
        <p className="text-xs text-muted-foreground">
          {s.fundName
            ? t("lt.src.rowsFund", { rows: fmtCount(s.rows), fund: s.fundName, file: s.fileName })
            : t("lt.src.rows", { rows: fmtCount(s.rows), file: s.fileName })}
        </p>
      )}
      {s?.lastError && <p className="text-xs text-highlight">{t("lt.src.lastError", { error: s.lastError })}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="text-xs uppercase text-muted-foreground mb-2">{label}</p>
        {children}
      </CardContent>
    </Card>
  )
}
