import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Income breakdown — groups all positive-amount transactions by category
// so income sources (Salary, Other Income, …) can be compared and tracked
// over time. Optional ?from=YYYY-MM&to=YYYY-MM range (both inclusive).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const from = searchParams.get("from")
    const to   = searchParams.get("to")

    const where: { amount: { gt: number }; date?: { gte?: Date; lt?: Date } } = {
      amount: { gt: 0 },
    }

    if (from || to) {
      where.date = {}
      if (from) {
        const [y, m] = from.split("-").map(Number)
        where.date.gte = new Date(y, m - 1, 1)
      }
      if (to) {
        const [y, m] = to.split("-").map(Number)
        where.date.lt = new Date(y, m, 1) // first of the month after `to`
      }
    }

    const rows = await prisma.transaction.findMany({
      where,
      include: { category: true },
      orderBy: { date: "asc" },
    })

    // Exclude internal movements between the user's own accounts.
    const transactions = rows.filter(t => t.category?.type !== "transfer")

    const total = transactions.reduce((sum, t) => sum + t.amount, 0)

    // ── Totals per income source (category)
    const byCategoryMap = new Map<string, {
      categoryName: string
      color:        string
      type:         string
      total:        number
      count:        number
    }>()

    // ── Monthly time series — one row per month, one key per category
    const byMonthMap = new Map<string, Record<string, number>>()

    for (const tx of transactions) {
      const name  = tx.category?.name  ?? "Uncategorized"
      const color = tx.category?.color ?? "#888888"
      const type  = tx.category?.type  ?? "income"

      const existing = byCategoryMap.get(name)
      if (existing) {
        existing.total += tx.amount
        existing.count += 1
      } else {
        byCategoryMap.set(name, { categoryName: name, color, type, total: tx.amount, count: 1 })
      }

      const d = new Date(tx.date)
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const row = byMonthMap.get(monthKey) ?? {}
      row[name] = (row[name] ?? 0) + tx.amount
      byMonthMap.set(monthKey, row)
    }

    const byCategory = Array.from(byCategoryMap.values())
      .map(c => ({
        ...c,
        total: Math.round(c.total * 100) / 100,
        share: total > 0 ? Math.round((c.total / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.total - a.total)

    const byMonth = Array.from(byMonthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amounts]) => {
        const rounded: Record<string, number> = {}
        for (const [k, v] of Object.entries(amounts)) {
          rounded[k] = Math.round(v * 100) / 100
        }
        return { month, total: Math.round(Object.values(amounts).reduce((s, v) => s + v, 0) * 100) / 100, ...rounded }
      })

    // category series present in the data (for chart keys + colors), in total order
    const series = byCategory.map(c => ({ name: c.categoryName, color: c.color }))

    return NextResponse.json({
      total: Math.round(total * 100) / 100,
      byCategory,
      byMonth,
      series,
    })

  } catch (error) {
    console.error("Income fetch error:", error)
    return NextResponse.json(
      { error: "Failed to generate income breakdown" },
      { status: 500 }
    )
  }
}
