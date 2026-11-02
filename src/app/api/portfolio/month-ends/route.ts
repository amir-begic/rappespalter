import { NextResponse } from "next/server"
import { loadMonthEndValues } from "@/lib/portfolio/store"

// Portfolio value at the end of each month (YYYY-MM → { date, value }), used to
// fill in the ETF balance on Net Worth and when recording a snapshot.
export async function GET() {
  try {
    return NextResponse.json(await loadMonthEndValues())
  } catch (error) {
    console.error("Month-end values error:", error)
    return NextResponse.json({ error: "Failed to load portfolio values" }, { status: 500 })
  }
}
