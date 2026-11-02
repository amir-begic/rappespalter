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

const fmtR = (n: number) => Math.round(n).toLocaleString("de-CH")
const fmtPct = (n: number | null, digits = 1) => n == null ? "—" : `${(n * 100).toFixed(digits)}%`
const fmtPp = (n: number) => `${n > 0.0005 ? "+" : n < -0.0005 ? "−" : ""}${Math.abs(n * 100).toFixed(1)} pp`
const fmtSigned = (n: number) => `${n > 0.5 ? "+" : n < -0.5 ? "−" : ""}${fmtR(Math.abs(n))}`
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
      if (!res.ok) throw new Error(d.error ?? "Save failed")
      await onSaved()
      setNotice({ tone: "ok", text: "Targets and fees saved." })
    } catch (e) {
      setNotice({ tone: "warn", text: e instanceof Error ? e.message : "Save failed" })
    } finally {
      setBusy(false)
    }
  }

  const set = (symbol: string, field: "target" | "ter", value: string) =>
    setEdit(e => ({ ...e, [symbol]: { ...e[symbol], [field]: value } }))

  const f = result.fees
  const hasTargets = result.rows.length > 0

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm text-muted-foreground">Allocation &amp; costs</CardTitle>
        <div className="flex items-center gap-2">
          {dirty && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEdit(initial())}>Reset</Button>}
          <Button size="sm" disabled={busy || !dirty || invalid} onClick={save}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Next contribution</span>
          <span className="text-xs text-muted-foreground">Fr.</span>
          <Input
            aria-label="Amount to invest next" inputMode="decimal" value={contribution}
            onChange={e => setContribution(e.target.value)} className="h-8 w-28 text-right font-mono"
          />
          <span className="text-xs text-muted-foreground">
            {hasTargets
              ? "is split to move you towards your targets without selling anything."
              : "— set target weights below to see how to split it."}
          </span>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Holding</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Now</TableHead>
                <TableHead className="text-right">Target</TableHead>
                <TableHead className="text-right">Off by</TableHead>
                <TableHead className="text-right">Buy next</TableHead>
                <TableHead className="text-right">Full rebalance</TableHead>
                <TableHead className="text-right">TER</TableHead>
                <TableHead className="text-right">Fund fee / yr</TableHead>
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
                      <PctInput label={`Target weight for ${p.symbol}`} value={edit[p.symbol]?.target ?? ""} onChange={v => set(p.symbol, "target", v)} placeholder="—" />
                    </TableCell>
                    <TableCell className={`text-right font-mono ${r && Math.abs(r.deviation) >= 0.05 ? "text-highlight" : ""}`}>
                      {r ? fmtPp(r.deviation) : ""}
                    </TableCell>
                    <TableCell className="text-right font-mono">{r && r.buy >= 0.5 ? fmtR(r.buy) : r ? "0" : ""}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{r ? fmtSigned(r.rebalance) : ""}</TableCell>
                    <TableCell className="text-right">
                      <PctInput label={`Annual fee (TER) for ${p.symbol}`} value={edit[p.symbol]?.ter ?? ""} onChange={v => set(p.symbol, "ter", v)} placeholder={isFund(p.kind) ? "e.g. 0.22" : "—"} />
                    </TableCell>
                    <TableCell className="text-right font-mono">{p.ter != null && !Number.isNaN(p.ter) ? fmtR(p.value * p.ter) : ""}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        {invalid && <p className="text-xs text-destructive">Enter percentages as numbers (TER at most 5%).</p>}
        {hasTargets && Math.abs(result.targetSum - 1) > 0.001 && (
          <p className="text-xs text-highlight">
            Targets add up to {fmtPct(result.targetSum)} — they&apos;re scaled to 100% across the holdings that have one.
          </p>
        )}

        <div className="rounded-lg border border-border px-4 py-3 text-sm">
          <p>
            Running costs ≈ <strong>Fr. {fmtR(f.totalYear)} per year</strong>
            {f.pctOfValue != null && <> ({fmtPct(f.pctOfValue, 2)} of your investments)</>}:
            {" "}fund fees Fr. {fmtR(f.fundCost)}{f.weightedTer != null && <> (average TER {fmtPct(f.weightedTer, 2)})</>}
            {" "}+ trading &amp; exchange fees Fr. {fmtR(f.tradingTtm)} over the last 12 months.
          </p>
          {missingTer.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Add the TER for {missingTer.join(", ")} (on the fund&apos;s factsheet) to include its fund fee.
            </p>
          )}
        </div>

        {notice && <p className={`text-xs ${notice.tone === "ok" ? "text-positive" : "text-destructive"}`}>{notice.text}</p>}
        <p className="text-xs text-muted-foreground leading-relaxed">
          Weights are of the holdings with a target{result.unmanaged.length ? ` — ${result.unmanaged.join(", ")} ${result.unmanaged.length === 1 ? "has" : "have"} none and ${result.unmanaged.length === 1 ? "is" : "are"} left out` : ""}.
          “Buy next” puts new money into the most underweight holdings first; “Full rebalance” is what you&apos;d buy (+) or sell (−) to hit the targets exactly today.
          The TER is charged inside the fund, so it never shows up as a fee in your account.
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
