import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ensureMarkTable, NOT_ONE_OFF } from "@/lib/marks"
import { loadAssets, loadLiabilities } from "@/lib/assets-store"
import { carCost, looksLikeCarCost } from "@/lib/assets"
import { driftWindow } from "@/lib/budget-drift"

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

const WINDOW_MONTHS = 12

// GET ?id=…: what a vehicle costs a month (src/lib/assets.ts carCost) — running
// costs averaged over the last WINDOW_MONTHS complete months, one-offs left out —
// plus the expense categories to choose its running costs from.
export async function GET(req: NextRequest) {
  try {
    const id = Number(new URL(req.url).searchParams.get("id"))
    if (!Number.isInteger(id)) return NextResponse.json({ error: "id is required" }, { status: 400 })
    await ensureMarkTable()
    const [assets, liabilities, categories, latest] = await Promise.all([
      loadAssets(),
      loadLiabilities(),
      prisma.category.findMany({
        where: { type: { in: ["fixed", "variable"] } },
        select: { id: true, name: true, color: true },
        orderBy: { name: "asc" },
      }),
      prisma.transaction.findFirst({ orderBy: { importedAt: "desc" }, select: { importedAt: true } }),
    ])
    const asset = assets.find(a => a.id === id)
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const rows = asset.costCategories.length
      ? await prisma.transaction.findMany({
          where:  { AND: [NOT_ONE_OFF, { categoryId: { in: asset.costCategories } }] },
          select: { date: true, amount: true, categoryId: true, counterparty: true },
        })
      : []
    const entries = rows.map(t => ({
      month: dayKey(new Date(t.date)).slice(0, 7), amount: t.amount,
      categoryId: t.categoryId, counterparty: t.counterparty,
    }))

    // Complete months only: the window ends before the month of the latest import.
    const today = dayKey(new Date())
    const lastImport = latest ? dayKey(new Date(latest.importedAt)) : today
    const dataMonths = (await prisma.transaction.findMany({ select: { date: true } }))
      .map(t => dayKey(new Date(t.date)).slice(0, 7))
    const window = driftWindow([...new Set(dataMonths)], lastImport < today ? lastImport : today, WINDOW_MONTHS)

    return NextResponse.json({
      cost: carCost(asset, liabilities, entries, window, today),
      categories: categories.map(c => ({ ...c, suggested: looksLikeCarCost(c.name) })),
    })
  } catch (error) {
    console.error("Car cost error:", error)
    return NextResponse.json({ error: "Failed to work out the car's cost" }, { status: 500 })
  }
}
