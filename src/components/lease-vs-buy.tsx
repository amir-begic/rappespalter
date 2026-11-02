"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { compareDeal, leaseRate, DEAL_DEFAULTS, type CarDeal } from "@/lib/car"

// Lease vs. buy (cash or loan) for one car over the same years, src/lib/car.ts.
// Nothing is saved; `initial` prefills it (e.g. from a vehicle and its loan).

const fmtR = (n: number) => Math.round(n).toLocaleString("de-CH")
const fmtPct = (n: number) => `${(n * 100).toLocaleString("de-CH", { maximumFractionDigits: 1 })}%`

function Slider({ label, value, min, max, step, display, onChange }: {
  label: string; value: number; min: number; max: number; step: number
  display: string; onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{display}</span>
      </span>
      <input
        type="range" min={min} max={Math.max(max, value)} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-primary"
      />
    </label>
  )
}

function Amount({ label, value, onChange, step = 100 }: {
  label: string; value: number; onChange: (v: number) => void; step?: number
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        type="number" min={0} step={step} value={value || ""}
        onChange={e => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
        className="mt-1 h-8"
      />
    </label>
  )
}

export function LeaseVsBuy({ initial }: { initial?: Partial<CarDeal> }) {
  const start = { ...DEAL_DEFAULTS, ...initial }
  const [deal, setDeal] = useState<CarDeal>(start)
  const set = (patch: Partial<CarDeal>) => setDeal(d => ({ ...d, ...patch }))
  const changed = JSON.stringify(deal) !== JSON.stringify(start)

  const options = useMemo(() => compareDeal(deal), [deal])
  const effective = useMemo(() => leaseRate(deal), [deal])
  const best = options.reduce((a, b) => (b.total < a.total ? b : a))
  const worst = Math.max(...options.map(o => o.total))

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm text-muted-foreground">Lease or buy?</CardTitle>
        {changed && <Button size="sm" variant="outline" onClick={() => setDeal(start)}>Reset</Button>}
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-muted-foreground">
          The same car for the same years, three ways. Bought cars are sold at the end; a leased one goes back.
          Money in the car can&apos;t be invested, so what it would have earned counts as a cost.
          Insurance, fuel and service are the same either way and left out — but a lease usually requires
          full (Vollkasko) cover.
        </p>

        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
          <div className="space-y-3">
            <p className="text-xs uppercase text-muted-foreground">The car</p>
            <Amount label="Price (Fr.)" value={deal.price} step={500} onChange={v => set({ price: v })} />
            <Slider
              label="Keep it for" value={deal.years} min={1} max={8} step={1}
              display={`${deal.years} ${deal.years === 1 ? "year" : "years"}`} onChange={v => set({ years: v })}
            />
            <Slider
              label="Loses a year" value={deal.depreciation} min={0.05} max={0.3} step={0.01}
              display={fmtPct(deal.depreciation)} onChange={v => set({ depreciation: v })}
            />
            <Slider
              label="Your money would earn" value={deal.invest} min={0} max={0.08} step={0.0025}
              display={fmtPct(deal.invest)} onChange={v => set({ invest: v })}
            />
          </div>
          <div className="space-y-3">
            <p className="text-xs uppercase text-muted-foreground">Loan</p>
            <Amount label="Down payment (Fr.)" value={deal.loanDown} onChange={v => set({ loanDown: v })} />
            <Slider
              label="Interest a year" value={deal.loanRate} min={0} max={0.12} step={0.001}
              display={fmtPct(deal.loanRate)} onChange={v => set({ loanRate: v })}
            />
          </div>
          <div className="space-y-3">
            <p className="text-xs uppercase text-muted-foreground">Lease</p>
            <Amount label="Down payment (Fr.)" value={deal.leaseDown} onChange={v => set({ leaseDown: v })} />
            <Amount label="Monthly payment (Fr.)" value={deal.leaseMonthly} step={10} onChange={v => set({ leaseMonthly: v })} />
            <Amount label="Buyout price at the end (Fr.)" value={deal.leaseResidual} onChange={v => set({ leaseResidual: v })} />
            {effective != null && (
              <p className="text-[11px] text-muted-foreground">
                Effective interest: <span className="font-mono text-foreground">{fmtPct(effective)}</span> a year
                {deal.loanRate > 0 && ` (loan: ${fmtPct(deal.loanRate)})`}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {options.map(o => (
            <div key={o.key} className={`rounded-2xl p-4 ${o.key === best.key ? "bg-pop-green text-white" : "bg-muted/60"}`}>
              <p className="text-xs uppercase opacity-80">{o.label}{o.key === best.key && " · cheapest"}</p>
              <p className="font-display text-2xl mt-1">Fr. {fmtR(o.perMonth)}<span className="text-sm font-normal">/month</span></p>
              <p className="text-xs opacity-80 mt-0.5">Fr. {fmtR(o.total)} over {deal.years} {deal.years === 1 ? "year" : "years"}</p>
              <div className="mt-3 h-1.5 rounded-full bg-current/15 overflow-hidden">
                <div className="h-full rounded-full bg-current" style={{ width: `${worst > 0 ? Math.max(0, o.total / worst * 100) : 0}%` }} />
              </div>
              <dl className="mt-3 space-y-0.5 text-xs">
                <div className="flex justify-between"><dt className="opacity-80">Paid</dt><dd className="font-mono">Fr. {fmtR(o.paid)}</dd></div>
                {o.interest > 0 && (
                  <div className="flex justify-between"><dt className="opacity-80">of which interest</dt><dd className="font-mono">Fr. {fmtR(o.interest)}</dd></div>
                )}
                <div className="flex justify-between"><dt className="opacity-80">Missed returns</dt><dd className="font-mono">Fr. {fmtR(o.missed)}</dd></div>
                <div className="flex justify-between"><dt className="opacity-80">Sold for</dt><dd className="font-mono">{o.resale > 0 ? `−Fr. ${fmtR(o.resale)}` : "—"}</dd></div>
              </dl>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          {best.key === "lease"
            ? `Leasing comes out Fr. ${fmtR(Math.min(...options.filter(o => o.key !== "lease").map(o => o.total)) - best.total)} cheaper — check the mileage limit and end-of-lease charges, which aren't included.`
            : `${best.label} comes out Fr. ${fmtR(options.find(o => o.key === "lease")!.total - best.total)} cheaper than leasing over ${deal.years} ${deal.years === 1 ? "year" : "years"}, assuming the car sells for Fr. ${fmtR(best.resale)} at the end.`}
        </p>
      </CardContent>
    </Card>
  )
}
