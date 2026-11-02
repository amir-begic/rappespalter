import { NextResponse } from "next/server"
import { loadAssets, loadLiabilities } from "@/lib/assets-store"
import { monthEndTotals } from "@/lib/assets"

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

// GET: other assets, debts and lease commitments at every month end (the month in
// progress as of today), for Net Worth: { months: { "YYYY-MM": Totals } }.
export async function GET() {
  try {
    const [assets, liabilities] = await Promise.all([loadAssets(), loadLiabilities()])
    return NextResponse.json({ months: monthEndTotals(assets, liabilities, dayKey(new Date())) })
  } catch (error) {
    console.error("Asset month-ends error:", error)
    return NextResponse.json({ error: "Failed to load asset values" }, { status: 500 })
  }
}
