"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { analyseAllocation } from "@/lib/portfolio/allocation"
import type { PortfolioSummary } from "@/lib/portfolio/store"
import { useT } from "@/lib/i18n/provider"

// Number writing in the current language.
function useFormats() {
  const { f, locale } = useT()
  const fmtR = f.int
  const digits = (n: number, d: number) => n.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d })
  return {
    fmtR,
    fmtPct: (n: number | null, d = 1) => n == null ? "—" : `${digits(n * 100, d)}%`,
    fmtPp: (n: number) => `${n > 0.0005 ? "+" : n < -0.0005 ? "−" : ""}${digits(Math.abs(n * 100), 1)} pp`,
    fmtSigned: (n: number) => `${n > 0.5 ? "+" : n < -0.5 ? "−" : ""}${fmtR(Math.abs(n))}`,
  }
}
const isFund = (kind: string | null) => kind === "ETF" || kind === "MUTUALFUND"

// Percent text from a stored fraction, and back (empty = not set).
const toPct = (f: number | null, digits: number) => f == null ? "" : String(Number((f * 100).toFixed(digits)))
const fromPct = (s: string) => {
  const t = s.trim().replace(",", ".")
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n / 100 : NaN
}

// Target allocation (where the next contribution should go) and running costs.
export function Allocation({ data, onSaved }: { data: PortfolioSummary; onSaved: () => Promise<unknown> }) {
  const { t, rich } = useT()
  const { fmtR, fmtPct, fmtPp, fmtSigned } = useFormats()
  const held = data.holdings.filter(h => h.units > 0)
  const secBySymbol = new Map(data.securities.map(s => [s.symbol, s]))

  const initial = () => Object.fromEntries(held.map(h => {
    const s = secBySymbol.get(h.symbol)
    return [h.symbol, { target: toPct(s?.targetWeight ?? null, 1), ter: toPct(s?.ter ?? null, 3) }]
  }))
  const [edit, setEdit] = useState<Record<string, { target: string; ter: string }>>(initial)
  const [contribution, setContribution] = useState(() => String(data.totals.cash >= 50 ? Math.floor(data.totals.cash) : 1000))
  const [busy, setBusy]     = useState(false)
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "warn" } | null>(null)

  const parsed = held.map(h => ({
    symbol: h.symbol, name: h.name, value: h.value, kind: h.kind,
    target: fromPct(edit[h.symbol]?.target ?? ""), ter: fromPct(edit[h.symbol]?.ter ?? ""),
  }))
  const invalid = parsed.some(p => Number.isNaN(p.target) || Number.isNaN(p.ter) || (p.ter != null && p.ter > 0.05))
  const amount = Math.max(0, Number(contribution.replace(/['’\s]/g, "")) || 0)

  // Cheap enough to recompute on every keystroke, so edits preview live.
  const result = analyseAllocation(
    parsed.map(p => ({ ...p, target: Number.isNaN(p.target) ? null : p.target, ter: Number.isNaN(p.ter) ? null : p.ter })),
    { contribution: amount, tradingFeesTtm: data.totals.feesTtm },
  )

  const dirty = held.some(h => {
    const s = secBySymbol.get(h.symbol)
    return edit[h.symbol]?.target !== toPct(s?.targetWeight ?? null, 1) || edit[h.symbol]?.ter !== toPct(s?.ter ?? null, 3)
  })
  const missingTer = parsed.filter(p => isFund(p.kind) && p.ter == null).map(p => p.symbol)
  const rowBySymbol = new Map(result.rows.map(r => [r.symbol, r]))

  async function save() {
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch("/api/portfolio/targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: parsed.map(p => ({ symbol: p.symbol, targetWeight: p.target, ter: p.ter })) }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? t("common.saveFailed"))
      await onSaved()
      setNotice({ tone: "ok", text: t("pf.alloc.saved") })
    } catch (e) {
      setNotice({ tone: "warn", text: e instanceof Error ? e.message : t("common.saveFailed") })
    } finally {
      setBusy(false)
    }
  }

  const set = (symbol: string, field: "target" | "ter", value: string) =>
    setEdit(e => ({ ...e, [symbol]: { ...e[symbol], [field]: value } }))

  const fees = result.fees
  const hasTargets = result.rows.length > 0

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm text-muted-foreground">{t("pf.alloc.title")}</CardTitle>
        <div className="flex items-center gap-2">
          {dirty && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEdit(initial())}>{t("common.reset")}</Button>}
          <Button size="sm" disabled={busy || !dirty || invalid} onClick={save}>{busy ? t("common.saving") : t("common.save")}</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("pf.alloc.next")}</span>
          <span className="text-xs text-muted-foreground">Fr.</span>
          <Input
            aria-label={t("pf.alloc.nextAria")} inputMode="decimal" value={contribution}
            onChange={e => setContribution(e.target.value)} className="h-8 w-28 text-right font-mono"
          />
          <span className="text-xs text-muted-foreground">
            {hasTargets ? t("pf.alloc.split") : t("pf.alloc.noTargets")}
          </span>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("pf.holdings.holding")}</TableHead>
                <TableHead className="text-right">{t("pf.holdings.value")}</TableHead>
                <TableHead className="text-right">{t("pf.alloc.now")}</TableHead>
                <TableHead className="text-right">{t("pf.alloc.target")}</TableHead>
                <TableHead className="text-right">{t("pf.alloc.offBy")}</TableHead>
                <TableHead className="text-right">{t("pf.alloc.buyNext")}</TableHead>
                <TableHead className="text-right">{t("pf.alloc.rebalance")}</TableHead>
                <TableHead className="text-right">{t("pf.alloc.ter")}</TableHead>
                <TableHead className="text-right">{t("pf.alloc.fundFee")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parsed.map(p => {
                const r = rowBySymbol.get(p.symbol)
                return (
                  <TableRow key={p.symbol}>
                    <TableCell className="max-w-48">
                      <span className="font-mono text-xs">{p.symbol}</span>
                      <p className="text-xs text-muted-foreground truncate">{p.name}</p>
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmtR(p.value)}</TableCell>
                    <TableCell className="text-right font-mono">{r ? fmtPct(r.weight) : "—"}</TableCell>
                    <TableCell className="text-right">
                      <PctInput label={t("pf.alloc.targetAria", { symbol: p.symbol })} value={edit[p.symbol]?.target ?? ""} onChange={v => set(p.symbol, "target", v)} placeholder="—" />
                    </TableCell>
                    <TableCell className={`text-right font-mono ${r && Math.abs(r.deviation) >= 0.05 ? "text-highlight" : ""}`}>
                      {r ? fmtPp(r.deviation) : ""}
                    </TableCell>
                    <TableCell className="text-right font-mono">{r && r.buy >= 0.5 ? fmtR(r.buy) : r ? "0" : ""}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{r ? fmtSigned(r.rebalance) : ""}</TableCell>
                    <TableCell className="text-right">
                      <PctInput label={t("pf.alloc.terAria", { symbol: p.symbol })} value={edit[p.symbol]?.ter ?? ""} onChange={v => set(p.symbol, "ter", v)} placeholder={isFund(p.kind) ? t("pf.alloc.terPlaceholder") : "—"} />
                    </TableCell>
                    <TableCell className="text-right font-mono">{p.ter != null && !Number.isNaN(p.ter) ? fmtR(p.value * p.ter) : ""}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        {invalid && <p className="text-xs text-destructive">{t("pf.alloc.invalid")}</p>}
        {hasTargets && Math.abs(result.targetSum - 1) > 0.001 && (
          <p className="text-xs text-highlight">
            {t("pf.alloc.sum", { sum: fmtPct(result.targetSum) })}
          </p>
        )}

        <div className="rounded-lg border border-border px-4 py-3 text-sm">
          <p>
            {rich("pf.alloc.costs", { b: text => <strong>{text}</strong> }, {
              total: fmtR(fees.totalYear),
              pct: fees.pctOfValue != null ? t("pf.alloc.ofInvestments", { pct: fmtPct(fees.pctOfValue, 2) }) : "",
              fund: fmtR(fees.fundCost),
              ter: fees.weightedTer != null ? t("pf.alloc.avgTer", { ter: fmtPct(fees.weightedTer, 2) }) : "",
              trading: fmtR(fees.tradingTtm),
            })}
          </p>
          {missingTer.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {t("pf.alloc.missingTer", { symbols: missingTer.join(", ") })}
            </p>
          )}
        </div>

        {notice && <p className={`text-xs ${notice.tone === "ok" ? "text-positive" : "text-destructive"}`}>{notice.text}</p>}
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t("pf.alloc.note", {
            unmanaged: result.unmanaged.length ? t("pf.alloc.unmanaged", { count: result.unmanaged.length, symbols: result.unmanaged.join(", ") }) : "",
          })}
        </p>
      </CardContent>
    </Card>
  )
}

function PctInput({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <Input
        aria-label={label} inputMode="decimal" value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} className="h-7 w-16 text-right font-mono text-xs"
      />
      <span className="text-xs text-muted-foreground">%</span>
    </div>
  )
}
