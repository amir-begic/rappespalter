import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { loadYearEnd } from "@/lib/portfolio/store"
import { yearEndSnapshot } from "@/lib/tax"
import { payeeName, resolveCounterparty } from "@/lib/counterparty"

// Snapshot months are stored as local midnight on the 1st; read them back in local time.
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
const round2 = (n: number) => Math.round(n * 100) / 100

// Figures for one year's tax return: GET /api/tax?year=2025&pillar3a=<categoryId>.
// Without a year: last year once it has data, otherwise this year. The Säule 3a
// category defaults to the savings category named like "3a". One-offs count.
export async function GET(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams
    const [first, last] = await Promise.all([
      prisma.transaction.findFirst({ orderBy: { date: "asc" },  select: { date: true } }),
      prisma.transaction.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
    ])
    const thisYear = new Date().getFullYear()
    const years: number[] = []
    if (first && last) {
      for (let y = new Date(last.date).getFullYear(); y >= new Date(first.date).getFullYear(); y--) years.push(y)
    }
    const requested = Number(params.get("year"))
    const year = years.includes(requested) ? requested
      : years.includes(thisYear - 1) ? thisYear - 1
      : years[0] ?? thisYear

    const savingsCategories = await prisma.category.findMany({
      where: { type: "savings" }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" },
    })
    const pick = Number(params.get("pillar3a"))
    const pillar3a = savingsCategories.find(c => c.id === pick) ?? savingsCategories.find(c => /3a/i.test(c.name)) ?? null

    const range = { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) }
    const [payments, income, snapshots, portfolio] = await Promise.all([
      pillar3a
        ? prisma.transaction.findMany({
            where: { categoryId: pillar3a.id, date: range },
            select: { id: true, date: true, counterparty: true, bookingText: true, amount: true },
            orderBy: { date: "asc" },
          })
        : Promise.resolve([]),
      prisma.transaction.findMany({
        where:  { date: range, amount: { gt: 0 }, NOT: { category: { type: "transfer" } } },
        select: { amount: true, category: { select: { name: true, color: true } } },
      }),
      prisma.snapshot.findMany({ orderBy: { month: "asc" } }),
      loadYearEnd(year),
    ])

    const incomeBy = new Map<string, { name: string; color: string; total: number }>()
    for (const t of income) {
      const name = t.category?.name ?? "Uncategorized"
      const row = incomeBy.get(name) ?? { name, color: t.category?.color ?? "#888888", total: 0 }
      row.total += t.amount
      incomeBy.set(name, row)
    }

    const snap = yearEndSnapshot(snapshots.map(s => ({ ...s, month: monthKey(s.month) })), year)

    return NextResponse.json({
      year,
      years,
      savingsCategories,
      pillar3a: pillar3a && {
        category: pillar3a,
        // Money out to the 3a account; a refund (money in) reduces it.
        total:    round2(-payments.reduce((s, p) => s + p.amount, 0)),
        payments: payments.map(p => ({
          id: p.id, amount: p.amount, date: p.date.toISOString(),
          // Older rows carry a bare "Dauerauftrag"; the payee is in the booking text.
          counterparty: payeeName(resolveCounterparty(p.counterparty, p.bookingText ?? "")),
        })),
      },
      income: [...incomeBy.values()].map(r => ({ ...r, total: round2(r.total) })).sort((a, b) => b.total - a.total),
      snapshot: snap && {
        month: snap.month, etf: snap.etf, savings: snap.savings, pillar3a: snap.pillar3a,
        pillar2: snap.pillar2, checking: snap.checking,
      },
      portfolio,
    })
  } catch (error) {
    console.error("Tax summary error:", error)
    return NextResponse.json({ error: "Failed to build the tax summary" }, { status: 500 })
  }
}
