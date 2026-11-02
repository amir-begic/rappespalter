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

// ── Formatting ──────────────────────────────────────────────────────────────

const fmtR   = (n: number) => Math.round(n).toLocaleString("de-CH")
const fmt2   = (n: number) => n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPct = (n: number | null, digits = 2) => n == null ? "—" : `${(n * 100).toFixed(digits)}%`
const dayLabel = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("de-CH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

const regionNames = typeof Intl !== "undefined" ? new Intl.DisplayNames(["en"], { type: "region" }) : null
const currencyNames = typeof Intl !== "undefined" ? new Intl.DisplayNames(["en"], { type: "currency" }) : null
const currencyName = (code: string) => {
  if (code === "Unknown") return code
  try { return `${code} · ${currencyNames?.of(code) ?? code}` } catch { return code }
}
const countryName = (code: string) => {
  if (code === "Unknown") return code
  try { return regionNames?.of(code) ?? code } catch { return code }
}

const PAGE = 20
const BARS = 12

type Fund = LookThroughSummary["funds"][number]
type Breakdown = "countries" | "sectors" | "currencies"

// ── Page ────────────────────────────────────────────────────────────────────

export default function LookThroughPage() {
  const [data, setData]     = useState<LookThroughSummary | null>(null)
  const [error, setError]   = useState<string | null>(null)
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "warn" } | null>(null)
  const [query, setQuery]   = useState("")
  const [shown, setShown]   = useState(PAGE)
  const [breakdown, setBreakdown] = useState<Breakdown>("countries")

  const load = useCallback(async () => {
    const res = await fetch("/api/portfolio/lookthrough")
    const d = await res.json()
    if (!res.ok) throw new Error(d.error ?? "Failed to load look-through")
    return d as LookThroughSummary
  }, [])

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
        <ArrowLeft className="size-4" /> Portfolio
      </Link>

      <div className="mb-8">
        <p className="text-xs tracking-widest uppercase text-muted-foreground mb-2">Portfolio</p>
        <h1 className="text-3xl font-semibold tracking-tight">Look-through</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          The companies inside your ETFs, combined with the stocks you hold directly, valued at today&apos;s
          prices. Weights come from the holdings files the fund companies publish.
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
        <div className="flex items-center gap-3 text-sm text-muted-foreground py-20 justify-center">
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Loading...
        </div>
      ) : data.total === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <p className="font-medium">No investments yet</p>
            <p className="text-sm text-muted-foreground">
              Import your Yuh activities on the <Link href="/portfolio" className="underline">Portfolio</Link> page first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Securities">
              <p className="text-2xl font-semibold">Fr. {fmtR(data.total)}</p>
              <p className="text-xs text-muted-foreground mt-1">ETFs and stocks, excluding cash</p>
            </Stat>
            <Stat label="Looked through">
              <p className="text-2xl font-semibold">{fmtPct(coverage, 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {data.notLookedThrough.length
                  ? `No holdings data yet: ${data.notLookedThrough.map(f => f.symbol).join(", ")}`
                  : `${fundsWithData.length} ETF${fundsWithData.length === 1 ? "" : "s"} broken down`}
              </p>
            </Stat>
            <Stat label="Companies">
              <p className="text-2xl font-semibold">{data.companies.length.toLocaleString("de-CH")}</p>
              <p className="text-xs text-muted-foreground mt-1">in {data.countries.length} countries</p>
            </Stat>
            <Stat label="Top 10 companies">
              <p className="text-2xl font-semibold">{fmtPct(data.top10Share, 1)}</p>
              <p className="text-xs text-muted-foreground mt-1">of your company exposure</p>
            </Stat>
          </div>

          {/* Companies */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Companies</CardTitle>
              <Input
                aria-label="Filter companies"
                placeholder="Find a company…"
                value={query}
                onChange={e => { setQuery(e.target.value); setShown(PAGE) }}
                className="h-8 w-56 text-sm"
              />
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {companies.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  {data.companies.length ? "No company matches." : "Upload a holdings file for one of your ETFs below to see its companies."}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-right">#</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                      <TableHead>Via</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companies.slice(0, shown).map(c => (
                      <TableRow key={`${c.rank}`}>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">{c.rank}</TableCell>
                        <TableCell className="max-w-72">
                          <p className="truncate font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[c.country && countryName(c.country), c.sector].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </TableCell>
                        <TableCell className="text-right font-mono">{c.value >= 10 ? fmtR(c.value) : fmt2(c.value)}</TableCell>
                        <TableCell className="text-right font-mono">{fmtPct(c.share, c.share >= 0.001 ? 2 : 3)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {c.via.map(v => (
                            <span key={v.symbol} className="mr-2" title={`Fr. ${fmt2(v.value)}`}>
                              <span className="font-mono font-medium text-foreground">{v.symbol}</span>
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
                  Showing {Math.min(shown, companies.length).toLocaleString("de-CH")} of {companies.length.toLocaleString("de-CH")}.
                  Share is of all your securities. A company held through several ETFs is combined into one line.
                </p>
                {shown < companies.length && (
                  <Button size="sm" variant="outline" onClick={() => setShown(s => s + PAGE * 2)}>Show more</Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Countries / sectors */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {breakdown === "countries" ? "By country" : breakdown === "sectors" ? "By sector" : "By currency"}
              </CardTitle>
              <Tabs value={breakdown} onValueChange={v => setBreakdown(v as Breakdown)}>
                <TabsList>
                  <TabsTrigger value="countries">Countries</TabsTrigger>
                  <TabsTrigger value="sectors">Sectors</TabsTrigger>
                  <TabsTrigger value="currencies">Currencies</TabsTrigger>
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
                  { label: "Cash & other", value: data.cashOther },
                  ...data.notLookedThrough.map(f => ({ label: `${f.symbol} (no holdings data)`, value: f.value })),
                ].filter(r => r.value >= 0.5).map(r => ({ ...r, share: r.value / data.total }))}
              />
              <p className="text-xs text-muted-foreground mt-3">
                {breakdown === "countries"
                  ? "Country of each company as reported by the fund company (usually where it is listed or incorporated)."
                  : breakdown === "sectors"
                    ? "Sectors are GICS. Vanguard classifies by ICB and is mapped onto GICS, so a few companies (e.g. Alphabet, Meta) appear under Information Technology rather than Communication Services."
                    : `The currency each holding trades in — what moves its CHF value when exchange rates change, whatever currency the ETF itself is quoted in.${data.currencyEstimatedShare >= 0.005
                      ? ` ${fmtPct(data.currencyEstimatedShare, 0)} is estimated from the company's country, because the file doesn't list currencies (Vanguard; or files uploaded before currencies were read — upload them again).`
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
            Your position values are today&apos;s; the weights inside each ETF are from the date of its holdings file.
            Weights drift slowly, so a file from the last few months is a good approximation. Companies are matched
            across files by ISIN, ticker and name; a rare miss shows the same company on two lines.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Ranked bars ─────────────────────────────────────────────────────────────

type BarRow = { label: string; value: number; share: number }

function BarList({ rows, extra }: { rows: BarRow[]; extra: BarRow[] }) {
  const top = rows.slice(0, BARS)
  const rest = rows.slice(BARS)
  const list = rest.length
    ? [...top, { label: `${rest.length} more`, value: rest.reduce((s, r) => s + r.value, 0), share: rest.reduce((s, r) => s + r.share, 0) }]
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

  if (!list.length) return <p className="text-sm text-muted-foreground">No holdings data yet.</p>
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
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">ETF holdings data</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">
          Download the full holdings file from each fund&apos;s page on the fund company&apos;s website and upload
          it to the matching ETF. Supported: iShares (<em>Holdings → Download Holdings</em>, CSV), Vanguard
          (<em>Holdings details → Download</em>, XLSX) and Xtrackers (<em>Constituents</em> export, XLSX).
          Xtrackers updates itself on every price refresh once uploaded; re-upload the others every few months.
        </p>
        {funds.length === 0 ? (
          <p className="text-sm text-muted-foreground">You don&apos;t hold any ETFs.</p>
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
      if (!res.ok) throw new Error(r.error ?? "Upload failed")
      await onChanged(`${fund.symbol}: ${r.rows.toLocaleString("de-CH")} holdings from ${r.provider}, as of ${dayLabel(r.asOf)}.${r.auto ? " It will update itself from now on." : ""}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`Remove the holdings data for ${fund.symbol}?`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/portfolio/lookthrough?symbol=${encodeURIComponent(fund.symbol)}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error ?? "Delete failed")
      await onChanged(`Holdings data for ${fund.symbol} removed.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="py-3 first:pt-0 last:pb-0 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-medium">{fund.symbol}</span>
        <span className="text-sm text-muted-foreground truncate">{fund.name}</span>
        <span className="text-xs text-muted-foreground">Fr. {fmtR(fund.value)}</span>
        {s ? (
          <>
            <Badge variant="outline">{s.provider} · as of {dayLabel(s.asOf)}</Badge>
            {s.auto && <Badge variant="secondary">Updates automatically</Badge>}
            {s.stale && <Badge variant="outline" className="border-highlight/50 text-highlight">{s.ageDays} days old — upload a newer file</Badge>}
          </>
        ) : (
          <Badge variant="outline" className="border-highlight/50 text-highlight">No holdings data</Badge>
        )}
        <div className="flex items-center gap-1 sm:ml-auto">
          <input
            id={inputId} type="file" accept=".csv,.xlsx,text/csv" className="hidden" disabled={busy}
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f) }}
          />
          <Button size="sm" variant="outline" disabled={busy} asChild>
            <label htmlFor={inputId} className="cursor-pointer"><Upload /> {s ? "Replace file" : "Upload file"}</label>
          </Button>
          {s && <Button size="sm" variant="ghost" disabled={busy} onClick={remove}>Remove</Button>}
        </div>
      </div>
      {s && (
        <p className="text-xs text-muted-foreground">
          {s.rows.toLocaleString("de-CH")} holdings{s.fundName ? ` · ${s.fundName}` : ""} · {s.fileName}
        </p>
      )}
      {s?.lastError && <p className="text-xs text-highlight">Last automatic update failed — using the saved file. {s.lastError}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{label}</p>
        {children}
      </CardContent>
    </Card>
  )
}
