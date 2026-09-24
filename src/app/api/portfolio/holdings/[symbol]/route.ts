import { NextRequest, NextResponse } from "next/server"
import { loadHoldingDetail } from "@/lib/portfolio/store"

// Performance of a single holding: price history with trades, cost basis,
// gains and dividends.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  try {
    const { symbol } = await params
    const detail = await loadHoldingDetail(decodeURIComponent(symbol))
    if (!detail) {
      return NextResponse.json({ error: `No holding "${symbol}"` }, { status: 404 })
    }
    return NextResponse.json(detail)
  } catch (error) {
    console.error("Holding detail error:", error)
    return NextResponse.json({ error: "Failed to load holding" }, { status: 500 })
  }
}
