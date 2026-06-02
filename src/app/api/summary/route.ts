import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const month = searchParams.get("month")

    if (!month) {
      return NextResponse.json(
        { error: "month parameter is required (format: YYYY-MM)" },
        { status: 400 }
      )
    }

    const [year, mon] = month.split("-").map(Number)
    const from = new Date(year, mon - 1, 1)
    const to   = new Date(year, mon, 1)

    const transactions = await prisma.transaction.findMany({
      where: { date: { gte: from, lt: to } },
      include: { category: true },
    })

    const budgets = await prisma.budget.findMany({
      include: { category: true },
    })

    // ── Totals — split savings out from expenses
    // "transfer"-type categories (e.g. Internal Transfer) are movements between
    // the user's own accounts — excluded from income, expenses and savings.
    const income = transactions
      .filter(t => t.amount > 0 && t.category?.type !== "transfer")
      .reduce((sum, t) => sum + t.amount, 0)

    const saved = transactions
      .filter(t => t.amount < 0 && t.category?.type === "savings")
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)

    const expenses = transactions
      .filter(t => t.amount < 0 && t.category?.type !== "savings" && t.category?.type !== "transfer")
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)

    const savingsRate = income > 0
      ? Math.round((saved / income) * 100)
      : 0

    const net = income - expenses

    // ── Spending by category (exclude savings type)
    const categoryTotals = new Map<string, {
      categoryId:   number
      categoryName: string
      color:        string
      type:         string
      actual:       number
      budget:       number | null
    }>()
    

    for (const tx of transactions) {
      if (tx.amount >= 0) continue
      if (!tx.category) continue
      if (tx.category.type === "savings") continue // exclude from spending breakdown
      if (tx.category.type === "transfer") continue // internal movement, not spending

      const key = tx.category.name
      const existing = categoryTotals.get(key)

      if (existing) {
        existing.actual += Math.abs(tx.amount)
      } else {
        categoryTotals.set(key, {
          categoryId:   tx.category.id,
          categoryName: tx.category.name,
          color:        tx.category.color,
          type:         tx.category.type,
          actual:       Math.abs(tx.amount),
          budget:       null,
        })
      }
    }

    // ── Savings breakdown by category
    const savingsBreakdown = new Map<string, {
      categoryName: string
      color:        string
      actual:       number
    }>()

    for (const tx of transactions) {
      if (tx.amount >= 0) continue
      if (!tx.category) continue
      if (tx.category.type !== "savings") continue

      const key = tx.category.name
      const existing = savingsBreakdown.get(key)
      if (existing) {
        existing.actual += Math.abs(tx.amount)
      } else {
        savingsBreakdown.set(key, {
          categoryName: tx.category.name,
          color:        tx.category.color,
          actual:       Math.abs(tx.amount),
        })
      }
    }

    for (const budget of budgets) {
      const entry = categoryTotals.get(budget.category.name)
      if (entry) entry.budget = budget.monthlyLimit
    }

    const byCategory = Array.from(categoryTotals.values())
      .sort((a, b) => b.actual - a.actual)

    const bySavings = Array.from(savingsBreakdown.values())
      .sort((a, b) => b.actual - a.actual)

    // Month-vs-budget comparison across ALL budgeted categories — including
    // any with zero spend this month (actual = 0), so nothing silently drops.
    const flags = budgets
      .map(b => {
        const actual = categoryTotals.get(b.category.name)?.actual ?? 0
        return {
          categoryName: b.category.name,
          color:        b.category.color,
          actual,
          budget:       b.monthlyLimit,
          delta:        actual - b.monthlyLimit,
          status:       actual > b.monthlyLimit ? "over" : "under",
        }
      })
      .sort((a, b) => b.delta - a.delta)

    // Totals for the headline "spent X of Y budgeted" comparison.
    const budgetTotals = {
      budget: Math.round(flags.reduce((s, f) => s + f.budget, 0) * 100) / 100,
      actual: Math.round(flags.reduce((s, f) => s + f.actual, 0) * 100) / 100,
    }

    const topExpenses = transactions
      .filter(t => t.amount < 0 && t.category?.type !== "savings" && t.category?.type !== "transfer")
      .sort((a, b) => a.amount - b.amount)
      .slice(0, 10)
      .map(t => ({
        id:           t.id,
        date:         t.date,
        counterparty: t.counterparty,
        amount:       t.amount,
        category:     t.category?.name ?? "Uncategorised",
        color:        t.category?.color ?? "#888",
      }))


      const savingsTransactions = transactions
  .filter(t => t.amount < 0 && t.category?.type === "savings")
  .sort((a, b) => a.amount - b.amount)
  .map(t => ({
    id:           t.id,
    date:         t.date,
    counterparty: t.counterparty,
    amount:       t.amount,
    category:     t.category?.name ?? "Savings",
    color:        t.category?.color ?? "#6aaa7a",
  }))

    const byType = { fixed: 0, variable: 0, savings: saved }
    for (const c of byCategory) {
      if (c.type === "fixed")    byType.fixed    += c.actual
      if (c.type === "variable") byType.variable += c.actual

      
    }

    return NextResponse.json({
      month,
      summary: {
        income:       Math.round(income   * 100) / 100,
        expenses:     Math.round(expenses * 100) / 100,
        saved:        Math.round(saved    * 100) / 100,
        savingsRate,
        net:          Math.round(net      * 100) / 100,
      },
      byCategory,
      bySavings,
      byType,
      flags,
      budgetTotals,
      topExpenses,
      savingsTransactions,
    })

  } catch (error) {
    console.error("Summary error:", error)
    return NextResponse.json(
      { error: "Failed to generate summary" },
      { status: 500 }
    )
  }
}