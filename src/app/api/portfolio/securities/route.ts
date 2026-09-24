import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ensurePortfolioSchema } from "@/lib/portfolio/schema"
import { fetchListing } from "@/lib/portfolio/market"

const iso = (d: Date) => d.toISOString().slice(0, 10)

// Change how a security is priced:
//   { symbol, priceSymbol: "VWRL.SW" }  use this listing (verified first)
//   { symbol, priceSymbol: null }       forget the listing and auto-match again
//   { symbol, priceSource: "manual" }   stop fetching; use manually entered prices
// Changing the listing drops its previously fetched prices; refresh afterwards.
export async function PATCH(req: NextRequest) {
  try {
    await ensurePortfolioSchema()
    const body = await req.json()
    const symbol = String(body?.symbol ?? "")
    const sec = await prisma.security.findUnique({ where: { symbol } })
    if (!sec) return NextResponse.json({ error: `Unknown security "${symbol}"` }, { status: 404 })

    let data: Parameters<typeof prisma.security.update>[0]["data"]
    if (body.priceSource === "manual") {
      data = { priceSource: "manual", priceCurrency: sec.currency, lastError: null }
    } else if (body.priceSymbol === null) {
      data = { priceSource: "yahoo", priceSymbol: null, priceCurrency: null, pinned: false, lastError: null }
    } else if (typeof body.priceSymbol === "string" && body.priceSymbol.trim()) {
      const priceSymbol = body.priceSymbol.trim().toUpperCase()
      let listing
      try {
        listing = await fetchListing(priceSymbol, iso(new Date(Date.now() - 14 * 86_400_000)), iso(new Date()))
      } catch {
        listing = null
      }
      if (!listing?.points.length) {
        return NextResponse.json({ error: `No prices found for "${priceSymbol}"` }, { status: 400 })
      }
      data = {
        priceSource: "yahoo", priceSymbol, priceCurrency: listing.currency,
        kind: listing.kind ?? sec.kind, pinned: true, lastError: null,
      }
    } else {
      return NextResponse.json({ error: "Provide priceSymbol (string or null) or priceSource: \"manual\"" }, { status: 400 })
    }

    const [security] = await prisma.$transaction([
      prisma.security.update({ where: { symbol }, data }),
      prisma.securityPrice.deleteMany({ where: { symbol, source: "yahoo" } }),
    ])
    return NextResponse.json({ security })
  } catch (error) {
    console.error("Security update error:", error)
    return NextResponse.json({ error: "Failed to update security" }, { status: 500 })
  }
}

// Record a manual price: { symbol, price, date? (YYYY-MM-DD, default today) }.
// The price is in the security's price currency (its trade currency once
// switched to manual) and wins over a fetched close for the same day.
export async function POST(req: NextRequest) {
  try {
    await ensurePortfolioSchema()
    const body = await req.json()
    const symbol = String(body?.symbol ?? "")
    const price = Number(body?.price)
    const date = body?.date ? String(body.date) : iso(new Date())

    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: "price must be a number > 0" }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 })
    }
    const sec = await prisma.security.findUnique({ where: { symbol } })
    if (!sec) return NextResponse.json({ error: `Unknown security "${symbol}"` }, { status: 404 })

    await prisma.$transaction([
      prisma.securityPrice.upsert({
        where:  { symbol_date: { symbol, date } },
        update: { close: price, source: "manual" },
        create: { symbol, date, close: price, source: "manual" },
      }),
      ...(sec.priceCurrency ? [] : [
        prisma.security.update({ where: { symbol }, data: { priceCurrency: sec.currency } }),
      ]),
    ])
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Manual price error:", error)
    return NextResponse.json({ error: "Failed to save price" }, { status: 500 })
  }
}
