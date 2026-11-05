import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { NOT_ONE_OFF } from "@/lib/marks"

// Per-month income / expenses / savings trend across all recorded months.
// Mirrors the single-month logic in /api/summary, grouped by YYYY-MM:
//   income   = amount > 0, excluding transfers
//   saved    = amount < 0, savings-type categories (ETF, 3a, savings transfer)
//   expenses = amount < 0, excluding savings and transfers
// `liquidSaved` is the slice of savings that lands in *accessible* assets
// (everything savings-type except the locked Säule 3a) — used by the
// down-payment goal projection. Transactions marked one-off are left out, so a
// single big payment doesn't distort the trend or the averages built on it.
const LOCKED_SAVINGS = new Set(["Säule 3a"])

const round = (n: number) => Math.round(n * 100) / 100

export async function GET() {
  try {
    const transactions = await prisma.transaction.findMany({
      where:   NOT_ONE_OFF,
      include: { category: true },
    })

    const map = new Map<string, {
      income: number; expenses: number; saved: number; liquidSaved: number
    }>()

    for (const t of transactions) {
      const type = t.category?.type
      const d = new Date(t.date)
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const row = map.get(month) ?? { income: 0, expenses: 0, saved: 0, liquidSaved: 0 }

      if (t.amount > 0 && type !== "transfer") {
        row.income += t.amount
      } else if (t.amount < 0 && type === "savings") {
        const abs = Math.abs(t.amount)
        row.saved += abs
        if (!LOCKED_SAVINGS.has(t.category?.name ?? "")) row.liquidSaved += abs
      } else if (t.amount < 0 && type !== "transfer") {
        row.expenses += Math.abs(t.amount)
      }

      map.set(month, row)
    }

    const trend = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month,
        income:      round(v.income),
        expenses:    round(v.expenses),
        saved:       round(v.saved),
        liquidSaved: round(v.liquidSaved),
        net:         round(v.income - v.expenses),
        savingsRate: v.income > 0 ? Math.round((v.saved / v.income) * 100) : 0,
      }))

    return NextResponse.json({ trend })

  } catch (error) {
    console.error("Trends fetch error:", error)
    return NextResponse.json(
      { error: "Failed to generate trends" },
      { status: 500 }
    )
  }
}
