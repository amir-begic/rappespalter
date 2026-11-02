"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageLoading } from "@/components/page-loading"
import { AssetArt } from "@/components/asset-art"
import {
  AssetEditor, LiabilityEditor, newAssetDraft, newLiabilityDraft,
  type AssetDraft, type LiabilityDraft,
} from "@/components/asset-editors"
import {
  ASSET_KINDS, LIABILITY_KINDS, assetValueAt, commitmentAt, debtAt, endOf, gainOf, isActive, leasesOf,
  monthsElapsed, paymentOf, totalsAt,
  type Asset, type AssetKind, type Liability, type LiabilityKind,
} from "@/lib/assets"

interface AssetsData { assets: Asset[]; liabilities: Liability[]; today: string }

const fmtR = (n: number) => Math.round(n).toLocaleString("de-CH")
const fmtDay = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("de-CH", { month: "short", year: "numeric", timeZone: "UTC" })

export default function AssetsPage() {
  const router = useRouter()
  const [data, setData]         = useState<AssetsData | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [asset, setAsset]       = useState<AssetDraft | null>(null)
  const [liability, setLiability] = useState<LiabilityDraft | null>(null)

  function load() {
    fetch("/api/assets")
      .then(r => r.json())
      .then(d => d.error ? setError(d.error) : setData(d))
      .catch(() => setError("Failed to load assets"))
  }
  useEffect(load, [])

  const totals = data && totalsAt(data.assets, data.liabilities, data.today)
  const owned = data?.assets.filter(a => !a.soldDate || a.soldDate > data.today) ?? []
  const sold = data?.assets.filter(a => a.soldDate && a.soldDate <= data.today) ?? []
  const running = data?.liabilities.filter(l => isActive(l, data.today) || l.startDate > data.today) ?? []
  const done = data?.liabilities.filter(l => !running.includes(l)) ?? []

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">

      <div className="mb-8">
        <p className="text-xs uppercase text-muted-foreground mb-2">Wealth</p>
        <h1>Assets &amp; debts</h1>
        <p className="text-sm text-muted-foreground mt-2">
          What you own beyond your accounts — gold, crypto, collections, a car — and what you owe on it.
          Both count on Net Worth.
        </p>
      </div>

      {!data && !error && <PageLoading />}
      {error && <div className="text-sm text-destructive py-20 text-center">{error}</div>}

      {data && totals && (
        <div className="space-y-4">

          {(data.assets.length > 0 || data.liabilities.length > 0) && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="font-display text-3xl text-positive">Fr. {fmtR(totals.assets)}</p>
                  <p className="text-xs uppercase text-muted-foreground mt-1">Assets</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="font-display text-3xl text-negative">Fr. {fmtR(totals.debts)}</p>
                  <p className="text-xs uppercase text-muted-foreground mt-1">Debts</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="font-display text-3xl text-info">
                    {totals.assets - totals.debts < 0 ? "−" : ""}Fr. {fmtR(Math.abs(totals.assets - totals.debts))}
                  </p>
                  <p className="text-xs uppercase text-muted-foreground mt-1">Net</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="font-display text-3xl">Fr. {fmtR(totals.commitments)}</p>
                  <p className="text-xs uppercase text-muted-foreground mt-1">Lease payments to come</p>
                </CardContent>
              </Card>
            </div>
          )}

          {owned.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {owned.map(a => <AssetCard key={a.id} asset={a} data={data} />)}
            </div>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {data.assets.length ? "Add an asset" : "What else do you own?"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-2">
                {(Object.keys(ASSET_KINDS) as AssetKind[]).map(kind => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setAsset(newAssetDraft(kind))}
                    className="group flex flex-col items-center gap-1 rounded-xl p-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <AssetArt kind={kind} className="size-14 transition-transform group-hover:-rotate-6 group-hover:scale-105" />
                    {ASSET_KINDS[kind].label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm text-muted-foreground">Loans &amp; leases</CardTitle>
              <div className="flex flex-wrap gap-1.5">
                {(["loan", "lease", "mortgage"] as LiabilityKind[]).map(k => (
                  <Button key={k} size="sm" variant="outline" onClick={() => setLiability(newLiabilityDraft(k))}>
                    <Plus className="size-3" /> {LIABILITY_KINDS[k].label}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {data.liabilities.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing owed. A car loan or a lease added here counts against Net Worth and shows in the car&apos;s monthly cost.
                </p>
              ) : (
                <div className="space-y-4">
                  {[...running, ...done].map(l => (
                    <LiabilityRow
                      key={l.id} liability={l} today={data.today}
                      asset={data.assets.find(a => a.id === l.assetId)}
                      onEdit={() => setLiability({ ...l })}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {sold.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Sold</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sold.map(a => (
                  <Link key={a.id} href={`/assets/${a.id}`} className="flex items-center gap-3 rounded-xl p-1 text-sm hover:bg-accent">
                    <AssetArt kind={a.kind} subtype={a.subtype} className="size-8 shrink-0 opacity-60" />
                    <span className="flex-1 truncate">{a.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {fmtDay(a.soldDate!)}{a.soldPrice != null && ` · Fr. ${fmtR(a.soldPrice)}`}
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          <Link
            href="/assets/lease-or-buy"
            className="block rounded-3xl bg-card px-6 py-4 text-sm transition-colors hover:bg-accent"
          >
            <span className="text-xs uppercase text-muted-foreground">Thinking about a car?</span>
            <span className="block">Lease or buy — compare what each costs you a month →</span>
          </Link>
        </div>
      )}

      {asset && (
        <AssetEditor
          draft={asset}
          onChange={setAsset}
          onClose={() => setAsset(null)}
          onSaved={id => { setAsset(null); router.push(`/assets/${id}`) }}
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

function AssetCard({ asset: a, data }: { asset: Asset; data: AssetsData }) {
  const value = assetValueAt(a, data.today)
  const gain = gainOf(a, data.today)
  const leased = leasesOf(a.id, data.liabilities, data.today).length > 0
  const owed = data.liabilities.filter(l => l.assetId === a.id).reduce((s, l) => s + debtAt(l, data.today), 0)
  const label = a.kind === "collectible" && a.subtype && a.subtype !== a.name ? a.subtype : ASSET_KINDS[a.kind].label

  return (
    <Link href={`/assets/${a.id}`} className="block rounded-3xl focus-visible:outline-2 focus-visible:outline-ring">
      <Card className="h-full transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-rotate-1 hover:scale-[1.02]">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <AssetArt kind={a.kind} subtype={a.subtype} className="size-16 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase text-muted-foreground">
                {label}{a.quantity != null && ` · ${a.quantity.toLocaleString("de-CH")} ${a.unit ?? ""}`}
              </p>
              <p className="truncate text-lg">{a.name}</p>
              <p className="text-sm font-mono">
                {leased ? <span className="text-muted-foreground">Leased — not yours</span> : <>Fr. {fmtR(value)}</>}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {gain != null && !leased && (
              <span className={gain >= 0 ? "text-positive" : "text-negative"}>
                {gain >= 0 ? "+" : "−"}Fr. {fmtR(Math.abs(gain))} since bought
              </span>
            )}
            {owed > 0 && <span>Fr. {fmtR(owed)} owed · Fr. {fmtR(value - owed)} yours</span>}
            {a.valuation === "manual" && a.values.length > 0 && <span>valued {fmtDay(a.values.at(-1)!.date)}</span>}
            {a.kind === "vehicle" && <span className="text-foreground">Monthly cost →</span>}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function LiabilityRow({ liability: l, asset, today, onEdit }: {
  liability: Liability; asset?: Asset; today: string; onEdit: () => void
}) {
  const lease = l.kind === "lease"
  const end = endOf(l)
  const active = isActive(l, today)
  const paid = l.termMonths ? Math.min(1, Math.max(0, monthsElapsed(l.startDate, today) / l.termMonths)) : null
  const figure = lease ? commitmentAt(l, today) : debtAt(l, today)

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
        <span className="font-medium">{l.name}</span>
        <span className="text-xs uppercase text-muted-foreground">{LIABILITY_KINDS[l.kind].label}</span>
        {asset && <Link href={`/assets/${asset.id}`} className="text-xs text-muted-foreground underline">{asset.name}</Link>}
        <span className="ml-auto font-mono text-sm">
          {active || l.startDate > today
            ? <>Fr. {fmtR(figure)} <span className="text-xs text-muted-foreground">{lease ? "to come" : "owed"}</span></>
            : <span className="text-xs text-muted-foreground">Finished</span>}
        </span>
        <Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button>
      </div>
      {paid != null && (
        <div className="mt-1.5 h-2 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full ${lease ? "bg-pop-yellow" : "bg-pop-red"}`} style={{ width: `${paid * 100}%` }} />
        </div>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        Fr. {fmtR(paymentOf(l))}/month
        {!lease && l.rate > 0 && ` · ${(l.rate * 100).toLocaleString("de-CH", { maximumFractionDigits: 2 })}% interest`}
        {end ? ` · until ${fmtDay(end)}` : " · no end date"}
        {l.balloon > 0 && ` · Fr. ${fmtR(l.balloon)} ${lease ? "buyout" : "at the end"}`}
      </p>
    </div>
  )
}
