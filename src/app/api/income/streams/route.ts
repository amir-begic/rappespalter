import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { NOT_ONE_OFF } from "@/lib/marks"
import { analyseIncomeStreams, type IncomeEntry } from "@/lib/income"

// Local (Swiss) calendar date, matching how months are derived elsewhere in the app.
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

// Per-stream income trends over the full history: zero-filled monthly series
// with a 12-month average, yearly totals with like-for-like year-over-year
// change, and summary stats. Uses the same definition of income as
// /api/income: positive amounts, excluding transfer-type categories — and
// excluding one-offs, which would distort averages and year-over-year change.
export async function GET() {
  try {
    const rows = await prisma.transaction.findMany({
      where:   { amount: { gt: 0 }, ...NOT_ONE_OFF },
      include: { category: true },
      orderBy: { date: "asc" },
    })

    const entries: IncomeEntry[] = rows
      .filter(t => t.category?.type !== "transfer")
      .map(t => ({
        date:   dayKey(new Date(t.date)),
        stream: t.category?.name  ?? "Uncategorized",
        color:  t.category?.color ?? "#888888",
        type:   t.category?.type  ?? "income",
        amount: t.amount,
      }))

    const today = dayKey(new Date())
    return NextResponse.json({ today, streams: analyseIncomeStreams(entries, today) })

  } catch (error) {
    console.error("Income streams error:", error)
    return NextResponse.json({ error: "Failed to analyse income streams" }, { status: 500 })
  }
}
