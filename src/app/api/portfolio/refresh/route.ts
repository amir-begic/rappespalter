import { NextResponse } from "next/server"
import { refreshMarketData } from "@/lib/portfolio/store"

// Match new securities to market listings and fetch missing prices / FX rates.
export async function POST() {
  try {
    return NextResponse.json(await refreshMarketData())
  } catch (error) {
    console.error("Portfolio refresh error:", error)
    return NextResponse.json({ error: "Failed to refresh market data" }, { status: 500 })
  }
}
