"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { PortfolioSummary } from "@/lib/portfolio/store"
import { useT } from "@/lib/i18n/provider"

type Security = PortfolioSummary["securities"][number]

// How each held asset is priced: the automatically matched market listing,
// a user-chosen listing, or manually entered prices.
export function PriceSources({ securities, onChanged }: {
  securities: Security[]
  onChanged: (opts?: { refresh?: boolean }) => Promise<void>
}) {
  const { t, rich } = useT()
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{t("pf.src.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">
          {rich("pf.src.intro", { m: text => <span className="font-mono">{text}</span> })}
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
  const { t } = useT()
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
      if (!res.ok) throw new Error(data.error ?? t("pf.src.requestFailed"))
      await onChanged({ refresh })
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : t("pf.src.requestFailed"))
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
          <Badge variant="secondary">{t("pf.src.manual")}</Badge>
        ) : sec.lastError && sec.priceCount === 0 ? (
          <Badge variant="destructive">{t("pf.src.notPriced")}</Badge>
        ) : sec.priceSymbol ? (
          <Badge variant="outline">
            {sec.priceSymbol} · {sec.priceCurrency}{sec.pinned ? ` · ${t("pf.src.setByYou")}` : ""}
          </Badge>
        ) : (
          <Badge variant="outline">{t("pf.src.notMatched")}</Badge>
        )}
        <span className="text-xs text-muted-foreground">{t("pf.src.prices", { count: sec.priceCount })}</span>
      </div>

      {sec.lastError && !manual && (
        <p className={`text-xs ${sec.priceCount ? "text-highlight" : "text-destructive"}`}>
          {sec.priceCount ? `${t("pf.src.lastFailed")} ` : ""}{sec.lastError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!manual && (
          <>
            <Input
              aria-label={t("pf.src.listingAria", { symbol: sec.symbol })}
              placeholder={t("pf.src.listingPlaceholder")}
              value={listing}
              onChange={e => setListing(e.target.value)}
              className="h-7 w-40 font-mono text-xs"
            />
            <Button
              size="sm" variant="outline" disabled={busy || !listing.trim() || listing.trim().toUpperCase() === sec.priceSymbol}
              onClick={() => send("PATCH", { priceSymbol: listing }, true)}
            >
              {t("pf.src.useListing")}
            </Button>
            {sec.pinned && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => send("PATCH", { priceSymbol: null }, true)}>
                {t("pf.src.matchAuto")}
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => send("PATCH", { priceSource: "manual" }, false)}>
              {t("pf.src.useManual")}
            </Button>
          </>
        )}
        {manual && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => send("PATCH", { priceSymbol: null }, true)}>
            {t("pf.src.fetchAuto")}
          </Button>
        )}
        <div className="flex items-center gap-2 sm:ml-auto">
          <Input
            aria-label={t("pf.src.priceAria", { symbol: sec.symbol, currency: priceCcy })}
            type="number" min={0} step="any"
            placeholder={t("pf.src.pricePlaceholder", { currency: priceCcy })}
            value={price}
            onChange={e => setPrice(e.target.value)}
            className="h-7 w-40 text-xs"
          />
          <Button
            size="sm" variant="outline" disabled={busy || !(Number(price) > 0)}
            onClick={() => send("POST", { price: Number(price) }, false).then(ok => ok && setPrice(""))}
          >
            {t("pf.src.savePrice")}
          </Button>
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
