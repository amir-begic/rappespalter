import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ensureMarkTable, NOT_ONE_OFF } from "@/lib/marks"
import { BUDGETABLE_TYPES } from "@/lib/categories"
import { analyseBudgetDrift, type SpendEntry } from "@/lib/budget-drift"

// Local (Swiss) calendar date, matching how months are derived elsewhere in the app.
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

// Budget vs. actual over the last N complete months: GET /api/budgets/drift?months=6
// (1–24, default 6). Spending uses the same rule as /api/summary, minus
// transactions marked one-off (a budget can't plan for those).
export async function GET(req: NextRequest) {
  try {
    const param = Number(new URL(req.url).searchParams.get("months") ?? 6)
    const months = Number.isInteger(param) && param >= 1 && param <= 24 ? param : 6

    await ensureMarkTable()
    const [rows, categories, latest] = await Promise.all([
      prisma.transaction.findMany({
        where:   { amount: { lt: 0 }, ...NOT_ONE_OFF },
        select:  { date: true, amount: true, categoryId: true, category: { select: { type: true } } },
      }),
      prisma.category.findMany({ include: { budget: true } }),
      prisma.transaction.findFirst({ orderBy: { importedAt: "desc" }, select: { importedAt: true } }),
    ])

    const entries: SpendEntry[] = rows
      .filter(t => t.category?.type !== "savings" && t.category?.type !== "transfer")
      .map(t => ({ month: dayKey(new Date(t.date)).slice(0, 7), categoryId: t.categoryId, amount: -t.amount }))

    const result = analyseBudgetDrift(entries, categories.map(c => ({
      id: c.id, name: c.name, color: c.color, type: c.type,
      budget: BUDGETABLE_TYPES.has(c.type) ? c.budget?.monthlyLimit ?? null : null,
    })), {
      months,
      today:      dayKey(new Date()),
      // A month only counts once an import happened after it ended.
      lastImport: latest ? dayKey(new Date(latest.importedAt)) : null,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("Budget drift error:", error)
    return NextResponse.json({ error: "Failed to analyse budgets" }, { status: 500 })
  }
}
