"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Plus, X } from "lucide-react"
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageLoading } from "@/components/page-loading"
import { AssetArt, assetColor } from "@/components/asset-art"
import { LeaseVsBuy } from "@/components/lease-vs-buy"
import {
  AssetEditor, LiabilityEditor, assetDraftOf, newLiabilityDraft, todayKey,
  type AssetDraft, type LiabilityDraft,
} from "@/components/asset-editors"
import {
  ASSET_KINDS, LIABILITY_KINDS, assetValueAt, debtAt, gainOf, leasesOf, monthEnd, monthsBetween, ownedFrom, paymentOf,
  type Asset, type CarCost, type Liability,
} from "@/lib/assets"
import type { CarDeal } from "@/lib/car"

interface AssetsData { assets: Asset[]; liabilities: Liability[]; today: string }
interface CostData { cost: CarCost; categories: { id: number; name: string; color: string; suggested: boolean }[] }

const fmtR = (n: number) => Math.round(n).toLocaleString("de-CH")
const fmtDay = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("de-CH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
const fmtMonth = (m: string) =>
  new Date(m + "-01T00:00:00Z").toLocaleDateString("de-CH", { month: "short", year: "2-digit", timeZone: "UTC" })

export default function AssetPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData]   = useState<AssetsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [edit, setEdit]   = useState<AssetDraft | null>(null)
  const [liability, setLiability] = useState<LiabilityDraft | null>(null)

  function load() {
    fetch("/api/assets")
      .then(r => r.json())
      .then(d => d.error ? setError(d.error) : setData(d))
      .catch(() => setError("Failed to load the asset"))
  }
  useEffect(load, [])

  const asset = data?.assets.find(a => a.id === Number(id))
  const mine = data?.liabilities.filter(l => l.assetId === Number(id)) ?? []

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <Link href="/assets" className="inline-flex items-center gap-1 text-xs uppercase text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="size-3" /> Assets
      </Link>

      {!data && !error && <PageLoading />}
      {(error || (data && !asset)) && (
        <div className="text-sm text-destructive py-20 text-center">{error ?? "This asset doesn't exist (any more)."}</div>
      )}

      {data && asset && (
        <div>
          <div className="mb-8 flex items-start gap-4">
            <AssetArt kind={asset.kind} subtype={asset.subtype} className="size-20 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase text-muted-foreground mb-2">
                {asset.kind === "collectible" && asset.subtype ? asset.subtype : ASSET_KINDS[asset.kind].label}
              </p>
              <h1 className="truncate">{asset.name}</h1>
              {asset.notes && <p className="text-sm text-muted-foreground mt-2">{asset.notes}</p>}
            </div>
            <Button variant="outline" onClick={() => setEdit(assetDraftOf(asset))}>Edit</Button>
          </div>

          <div className="space-y-4">
            <Figures asset={asset} liabilities={mine} today={data.today} />
            <ValueChart asset={asset} liabilities={mine} today={data.today} />
            {asset.kind === "vehicle" && <CarCostCard asset={asset} onChanged={load} />}
            <Valuations asset={asset} onChanged={load} />
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm text-muted-foreground">Financing</CardTitle>
                <div className="flex gap-1.5">
                  {(asset.kind === "vehicle" ? ["loan", "lease"] as const : ["loan"] as const).map(k => (
                    <Button key={k} size="sm" variant="outline" onClick={() => setLiability(newLiabilityDraft(k, asset))}>
                      <Plus className="size-3" /> {LIABILITY_KINDS[k].label}
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {mine.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Paid for — no loan or lease on it.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {mine.map(l => (
                      <li key={l.id} className="flex flex-wrap items-baseline gap-x-3">
                        <span>{l.name}</span>
                        <span className="text-xs uppercase text-muted-foreground">{LIABILITY_KINDS[l.kind].label}</span>
                        <span className="ml-auto font-mono text-xs text-muted-foreground">
                          Fr. {fmtR(paymentOf(l))}/month{l.kind !== "lease" && ` · Fr. ${fmtR(debtAt(l, data.today))} owed`}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => setLiability({ ...l })}>Edit</Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            {asset.kind === "vehicle" && <LeaseVsBuy initial={dealFrom(asset, mine)} />}
          </div>
        </div>
      )}

      {edit && (
        <AssetEditor
          draft={edit}
          onChange={setEdit}
          onClose={() => setEdit(null)}
          onSaved={() => { setEdit(null); load() }}
          onDeleted={() => router.push("/assets")}
        />
      )}
      {liability && data && (
        <LiabilityEditor
          draft={liability}
          assets={data.assets}
          onChange={setLiability}
          onClose={() => setLiability(null)}
          onSaved={() => { setLiability(null); load() }}
        />
      )}
    </div>
  )
}

// The calculator starts from this car and its financing.
function dealFrom(a: Asset, liabilities: Liability[]): Partial<CarDeal> {
  const deal: Partial<CarDeal> = {}
  if (a.purchasePrice) deal.price = a.purchasePrice
  if (a.depreciationRate) deal.depreciation = a.depreciationRate
  const loan = liabilities.find(l => l.kind === "loan")
  if (loan) {
    deal.loanRate = loan.rate
    if (a.purchasePrice) deal.loanDown = Math.max(0, a.purchasePrice - loan.principal)
    if (loan.termMonths) deal.years = Math.max(1, Math.round(loan.termMonths / 12))
  }
  const lease = liabilities.find(l => l.kind === "lease")
  if (lease) {
    deal.leaseMonthly = paymentOf(lease)
    deal.leaseResidual = lease.balloon
    if (lease.principal) deal.price = lease.principal
    if (lease.termMonths) deal.years = Math.max(1, Math.round(lease.termMonths / 12))
  }
  return deal
}

function Figures({ asset, liabilities, today }: { asset: Asset; liabilities: Liability[]; today: string }) {
  const value = assetValueAt(asset, today)
  const gain = gainOf(asset, today)
  const leased = leasesOf(asset.id, liabilities, today).length > 0
  const owed = liabilities.reduce((s, l) => s + debtAt(l, today), 0)

  if (asset.soldDate && asset.soldDate <= today) {
    const result = asset.soldPrice != null && asset.purchasePrice != null ? asset.soldPrice - asset.purchasePrice : null
    return (
      <div className="grid grid-cols-2 gap-4">
        <Card><CardContent className="pt-6">
          <p className="font-display text-3xl">Fr. {fmtR(asset.soldPrice ?? 0)}</p>
          <p className="text-xs uppercase text-muted-foreground mt-1">Sold {fmtDay(asset.soldDate)}</p>
        </CardContent></Card>
        {result != null && (
          <Card><CardContent className="pt-6">
            <p className={`font-display text-3xl ${result >= 0 ? "text-positive" : "text-negative"}`}>
              {result >= 0 ? "+" : "−"}Fr. {fmtR(Math.abs(result))}
            </p>
            <p className="text-xs uppercase text-muted-foreground mt-1">Against the price paid</p>
          </CardContent></Card>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <Card><CardContent className="pt-6">
        <p className="font-display text-3xl text-positive">Fr. {fmtR(value)}</p>
        <p className="text-xs uppercase text-muted-foreground mt-1">
          {leased ? "Worth — leased, not counted" : asset.valuation === "depreciation" ? "Worth now (estimated)" : "Worth"}
        </p>
      </CardContent></Card>
      {gain != null && (
        <Card><CardContent className="pt-6">
          <p className={`font-display text-3xl ${gain >= 0 ? "text-info" : "text-negative"}`}>
            {gain >= 0 ? "+" : "−"}Fr. {fmtR(Math.abs(gain))}
          </p>
          <p className="text-xs uppercase text-muted-foreground mt-1">Since bought for Fr. {fmtR(asset.purchasePrice!)}</p>
        </CardContent></Card>
      )}
      {owed > 0 && (
        <Card><CardContent className="pt-6">
          <p className="font-display text-3xl text-highlight">Fr. {fmtR(value - owed)}</p>
          <p className="text-xs uppercase text-muted-foreground mt-1">Yours after Fr. {fmtR(owed)} owed</p>
        </CardContent></Card>
      )}
    </div>
  )
}

function ValueChart({ asset, liabilities, today }: { asset: Asset; liabilities: Liability[]; today: string }) {
  const points = useMemo(() => {
    const from = ownedFrom(asset)
    if (!from) return []
    const last = asset.soldDate && asset.soldDate < today ? asset.soldDate.slice(0, 7) : today.slice(0, 7)
    return monthsBetween(from.slice(0, 7), last).map(m => {
      const day = m === today.slice(0, 7) ? today : monthEnd(m)
      const owed = liabilities.reduce((s, l) => s + debtAt(l, day), 0)
      return { month: m, value: Math.round(assetValueAt(asset, day)), ...(owed > 0 ? { owed: Math.round(owed) } : {}) }
    })
  }, [asset, liabilities, today])

  if (points.length < 2) return null
  const color = assetColor(asset.kind)
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">Value over time</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={v => fmtR(Number(v))} />
            <Tooltip
              labelFormatter={label => fmtMonth(String(label))}
              formatter={(value, name) => [`Fr. ${fmtR(Number(value))}`, name]}
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px", color: "var(--card-foreground)" }}
            />
            <Legend wrapperStyle={{ fontSize: "12px" }} />
            <Area
              type={asset.valuation === "depreciation" ? "monotone" : "stepAfter"}
              dataKey="value" name="Value" stroke={color} fill={color} fillOpacity={0.4}
            />
            {points.some(p => "owed" in p) && (
              <Line type="monotone" dataKey="owed" name="Owed" stroke="var(--foreground)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function Valuations({ asset, onChanged }: { asset: Asset; onChanged: () => void }) {
  const [date, setDate]   = useState(todayKey())
  const [value, setValue] = useState("")
  const [busy, setBusy]   = useState(false)

  async function add() {
    setBusy(true)
    await fetch("/api/assets/values", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: asset.id, date, value: Number(value) }),
    })
    setValue("")
    setBusy(false)
    onChanged()
  }

  async function remove(id: number) {
    await fetch(`/api/assets/values?id=${id}`, { method: "DELETE" })
    onChanged()
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">Valuations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {asset.valuation === "depreciation"
            ? "The value follows the depreciation curve from the purchase price. A valuation — a dealer's quote, a comparable listing — resets it, and the curve carries on from there."
            : "The latest valuation is what it's worth until you add a newer one. For collections, one value for the whole lot is enough."}
        </p>
        {asset.values.length > 0 && (
          <ul className="space-y-1 text-sm">
            {[...asset.values].reverse().map(v => (
              <li key={v.id} className="flex items-center gap-3">
                <span className="text-muted-foreground">{fmtDay(v.date)}</span>
                <span className="ml-auto font-mono">Fr. {fmtR(v.value)}</span>
                <button type="button" aria-label={`Delete the valuation of ${fmtDay(v.date)}`} onClick={() => remove(v.id)} className="text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="text-xs uppercase text-muted-foreground">On</span>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 h-9 w-40" />
          </label>
          <label className="block">
            <span className="text-xs uppercase text-muted-foreground">Worth (Fr.)</span>
            <Input type="number" min={0} step={10} value={value} onChange={e => setValue(e.target.value)} className="mt-1 h-9 w-36" />
          </label>
          <Button disabled={busy || !date || value === "" || Number(value) < 0} onClick={add}>Add valuation</Button>
        </div>
      </CardContent>
    </Card>
  )
}

// What the car costs a month: depreciation, financing and running costs from the
// chosen expense categories (src/lib/assets.ts carCost). Refetched whenever the page reloads its data (a new `asset` object), e.g. after
// a loan or lease changes.
function CarCostCard({ asset, onChanged }: { asset: Asset; onChanged: () => void }) {
  const [data, setData] = useState<CostData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stale = false
    fetch(`/api/assets/car?id=${asset.id}`)
      .then(r => r.json())
      .then(d => {
        if (stale) return
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(() => { if (!stale) setError("Failed to work out the costs") })
    return () => { stale = true }
  }, [asset])

  async function setCategories(ids: number[]) {
    await fetch("/api/assets", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...assetDraftOf(asset), costCategories: ids }),
    })
    onChanged()
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!data) return null
  const { cost, categories } = data
  const chosen = new Set(asset.costCategories)
  const suggested = categories.filter(c => c.suggested && !chosen.has(c.id))
  const name = (id: number) => categories.find(c => c.id === id)

  const rows: { label: string; amount: number; color: string; note?: string }[] = [
    ...(cost.depreciation > 0 ? [{ label: "Losing value", amount: cost.depreciation, color: "var(--pop-pink)", note: "depreciation" }] : []),
    ...cost.financing.map(f => ({
      label: f.name, amount: f.amount, color: "var(--pop-yellow)",
      note: f.kind === "lease" ? "lease payment" : "interest only — repaying the loan isn't a cost",
    })),
    ...cost.running.map(r => ({ label: name(r.categoryId)?.name ?? "Category", amount: r.amount, color: name(r.categoryId)?.color ?? "var(--border)" })),
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card>
        <CardContent className="pt-6">
          <p className="font-display text-3xl text-negative">Fr. {fmtR(cost.total)}</p>
          <p className="text-xs uppercase text-muted-foreground mt-1">This car costs you a month</p>
          <p className="text-xs text-muted-foreground mt-3">
            Fr. {fmtR(cost.total * 12)} a year
            {cost.months.length > 0 && asset.costCategories.length > 0 &&
              ` · running costs averaged over ${cost.months.length} complete ${cost.months.length === 1 ? "month" : "months"}, one-offs left out`}
          </p>
        </CardContent>
      </Card>

      <Card className="sm:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Where it goes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.length > 0 && (
            <div className="flex h-3 overflow-hidden rounded-full bg-muted">
              {rows.map((r, i) => cost.total > 0 && r.amount > 0 && (
                <div key={i} title={`${r.label}: Fr. ${fmtR(r.amount)}`} className="h-full border-r-2 border-card last:border-r-0" style={{ width: `${r.amount / cost.total * 100}%`, background: r.color }} />
              ))}
            </div>
          )}
          <ul className="space-y-1 text-sm">
            {rows.map((r, i) => (
              <li key={i} className="flex items-baseline gap-2">
                <span className="size-2 shrink-0 rounded-sm" style={{ background: r.color }} />
                <span>{r.label}</span>
                {r.note && <span className="text-xs text-muted-foreground">{r.note}</span>}
                <span className="ml-auto font-mono">Fr. {fmtR(r.amount)}</span>
              </li>
            ))}
          </ul>

          <div className="border-t border-border pt-3 text-xs text-muted-foreground">
            <p className="mb-2">
              Running costs come from these expense categories (fuel, insurance, parking, motor-vehicle tax, service…):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {asset.costCategories.map(id => (
                <button
                  key={id} type="button" onClick={() => setCategories(asset.costCategories.filter(c => c !== id))}
                  className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-foreground hover:bg-muted"
                  aria-label={`Stop counting ${name(id)?.name ?? "this category"}`}
                >
                  <span className="size-2 rounded-sm" style={{ background: name(id)?.color }} />
                  {name(id)?.name ?? `#${id}`} <X className="size-3" />
                </button>
              ))}
              <select
                value=""
                onChange={e => e.target.value && setCategories([...asset.costCategories, Number(e.target.value)])}
                className="rounded-full border border-input bg-card px-2.5 py-1 text-foreground"
                aria-label="Add a category"
              >
                <option value="">+ Add a category</option>
                {categories.filter(c => !chosen.has(c.id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {suggested.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => setCategories([...asset.costCategories, ...suggested.map(c => c.id)])}>
                  Add {suggested.map(c => c.name).join(", ")}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
