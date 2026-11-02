"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { PortfolioSummary } from "@/lib/portfolio/store"

type Security = PortfolioSummary["securities"][number]

// How each held asset is priced: the automatically matched market listing,
// a user-chosen listing, or manually entered prices.
export function PriceSources({ securities, onChanged }: {
  securities: Security[]
  onChanged: (opts?: { refresh?: boolean }) => Promise<void>
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">Price sources</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">
          Each holding is matched to a market listing on Yahoo Finance by the currency and price of your
          first trade. Enter a different listing (e.g. <span className="font-mono">VWRL.SW</span>) if a match
          is wrong, or switch to manual prices for assets Yahoo doesn&apos;t cover.
        </p>
        <div className="divide-y divide-border">
          {securities.map(s => <SecurityRow key={s.symbol} sec={s} onChanged={onChanged} />)}
        </div>
      </CardContent>
    </Card>
  )
}

function SecurityRow({ sec, onChanged }: {
  sec: Security
  onChanged: (opts?: { refresh?: boolean }) => Promise<void>
}) {
  const [listing, setListing] = useState(sec.priceSymbol ?? "")
  const [price, setPrice]     = useState("")
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function send(method: "PATCH" | "POST", body: object, refresh: boolean): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      const res  = await fetch("/api/portfolio/securities", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sec.symbol, ...body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Request failed")
      await onChanged({ refresh })
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed")
      return false
    } finally {
      setBusy(false)
    }
  }

  const manual = sec.priceSource === "manual"
  const priceCcy = sec.priceCurrency ?? sec.currency

  return (
    <div className="py-3 first:pt-0 last:pb-0 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm">{sec.symbol}</span>
        <span className="text-sm text-muted-foreground truncate">{sec.name}</span>
        {manual ? (
          <Badge variant="secondary">Manual prices</Badge>
        ) : sec.lastError && sec.priceCount === 0 ? (
          <Badge variant="destructive">Not priced</Badge>
        ) : sec.priceSymbol ? (
          <Badge variant="outline">
            {sec.priceSymbol} · {sec.priceCurrency}{sec.pinned ? " · set by you" : ""}
          </Badge>
        ) : (
          <Badge variant="outline">Not matched yet</Badge>
        )}
        <span className="text-xs text-muted-foreground">{sec.priceCount} prices</span>
      </div>

      {sec.lastError && !manual && (
        <p className={`text-xs ${sec.priceCount ? "text-highlight" : "text-destructive"}`}>
          {sec.priceCount ? "Last update failed — using saved prices. " : ""}{sec.lastError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!manual && (
          <>
            <Input
              aria-label={`Market listing for ${sec.symbol}`}
              placeholder="Listing, e.g. VWRL.SW"
              value={listing}
              onChange={e => setListing(e.target.value)}
              className="h-7 w-40 font-mono text-xs"
            />
            <Button
              size="sm" variant="outline" disabled={busy || !listing.trim() || listing.trim().toUpperCase() === sec.priceSymbol}
              onClick={() => send("PATCH", { priceSymbol: listing }, true)}
            >
              Use listing
            </Button>
            {sec.pinned && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => send("PATCH", { priceSymbol: null }, true)}>
                Match automatically
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => send("PATCH", { priceSource: "manual" }, false)}>
              Use manual prices
            </Button>
          </>
        )}
        {manual && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => send("PATCH", { priceSymbol: null }, true)}>
            Fetch prices automatically
          </Button>
        )}
        <div className="flex items-center gap-2 sm:ml-auto">
          <Input
            aria-label={`Today's price for ${sec.symbol} in ${priceCcy}`}
            type="number" min={0} step="any"
            placeholder={`Price today (${priceCcy})`}
            value={price}
            onChange={e => setPrice(e.target.value)}
            className="h-7 w-40 text-xs"
          />
          <Button
            size="sm" variant="outline" disabled={busy || !(Number(price) > 0)}
            onClick={() => send("POST", { price: Number(price) }, false).then(ok => ok && setPrice(""))}
          >
            Save price
          </Button>
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
