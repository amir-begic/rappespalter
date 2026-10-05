import { NextRequest, NextResponse } from "next/server"
import { refreshMarketData } from "@/lib/portfolio/store"

// Match new securities to market listings and fetch missing prices / FX rates.
// POST /api/portfolio/refresh?auto=1 skips the work if a refresh ran recently.
export async function POST(req: NextRequest) {
  try {
    const auto = new URL(req.url).searchParams.get("auto") === "1"
    return NextResponse.json(await refreshMarketData({ auto }))
  } catch (error) {
    console.error("Portfolio refresh error:", error)
    return NextResponse.json({ error: "Failed to refresh market data" }, { status: 500 })
  }
}
