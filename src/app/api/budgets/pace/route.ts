import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { BUDGETABLE_TYPES } from "@/lib/categories"
import { analysePace, type PaceEntry } from "@/lib/pace"

// Local (Swiss) calendar date, matching how months are derived elsewhere in the app.
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

// Where a month in progress is heading: GET /api/budgets/pace?month=YYYY-MM.
// The projection runs from the latest import (or today, if that's earlier) —
// anything after the last import isn't in the data yet. One-offs count as
// spending in the month itself but not in the "usual" amounts from earlier months.
export async function GET(req: NextRequest) {
  try {
    const month = new URL(req.url).searchParams.get("month") ?? ""
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "month parameter is required (format: YYYY-MM)" }, { status: 400 })
    }

    const [rows, categories, latest] = await Promise.all([
      prisma.transaction.findMany({
        where:  { amount: { lt: 0 } },
        select: { date: true, amount: true, categoryId: true, category: { select: { type: true } }, mark: { select: { oneOff: true } } },
      }),
      prisma.category.findMany({ include: { budget: true } }),
      prisma.transaction.findFirst({ orderBy: { importedAt: "desc" }, select: { importedAt: true } }),
    ])

    const today = dayKey(new Date())
    const lastImport = latest ? dayKey(new Date(latest.importedAt)) : today
    const entries: PaceEntry[] = rows
      .filter(t => t.category?.type !== "savings" && t.category?.type !== "transfer")
      .map(t => ({ date: dayKey(new Date(t.date)), categoryId: t.categoryId, amount: -t.amount, oneOff: t.mark?.oneOff ?? false }))
      .filter(t => !t.oneOff || t.date.startsWith(month))

    return NextResponse.json(analysePace(entries, categories.map(c => ({
      id: c.id, name: c.name, color: c.color, type: c.type,
      budget: BUDGETABLE_TYPES.has(c.type) ? c.budget?.monthlyLimit ?? null : null,
    })), { month, asOf: lastImport < today ? lastImport : today }))
  } catch (error) {
    console.error("Pace error:", error)
    return NextResponse.json({ error: "Failed to project spending" }, { status: 500 })
  }
}
