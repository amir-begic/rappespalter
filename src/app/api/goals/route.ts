import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ensureMarkTable, NOT_ONE_OFF } from "@/lib/marks"
import { ensureSettingTable } from "@/lib/setting-table"
import { DEFAULT_SETTINGS } from "@/lib/settings"
import { driftWindow } from "@/lib/budget-drift"
import { ensureGoalTables, loadGoals } from "@/lib/goals-store"
import { assetOfSavingsCategory, isAssetKey, isGoalKind, savingsPace, zeroAssets, type Allocation, type AssetKey } from "@/lib/goals"

// Local (Swiss) calendar date, matching how months are derived elsewhere in the app.
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

const PACE_MONTHS = 6
// Setting key prefix for "savings category <id> feeds asset <key>".
const SOURCE_KEY = "goals.source."

// GET: the goals, the latest snapshot's balances and the savings pace per asset
// (average over the last PACE_MONTHS complete months, one-offs left out), plus
// which asset each savings category feeds. Allocation and projections are
// worked out on the page (src/lib/goals.ts).
export async function GET() {
  try {
    await Promise.all([ensureMarkTable(), ensureSettingTable()])
    const [goals, snapshot, rows, latest, pillar2, categories, sources] = await Promise.all([
      loadGoals(),
      prisma.snapshot.findFirst({ orderBy: { month: "desc" } }),
      prisma.transaction.findMany({
        where:  NOT_ONE_OFF,
        select: { date: true, amount: true, category: { select: { id: true, type: true, name: true } } },
      }),
      prisma.transaction.findFirst({ orderBy: { importedAt: "desc" }, select: { importedAt: true } }),
      prisma.setting.findUnique({ where: { key: "monthlyPillar2" } }),
      prisma.category.findMany({ where: { type: "savings" }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
      prisma.setting.findMany({ where: { key: { startsWith: SOURCE_KEY } } }),
    ])

    const chosen = new Map(sources.map(s => [Number(s.key.slice(SOURCE_KEY.length)), s.value]))
    const assetOf = (id: number | null, name: string | null): AssetKey => {
      const v = id == null ? undefined : chosen.get(id)
      return isAssetKey(v) && v !== "checking" ? v : assetOfSavingsCategory(name)
    }

    const balances = zeroAssets()
    if (snapshot) {
      balances.checking = snapshot.checking
      balances.savings  = snapshot.savings
      balances.etf      = snapshot.etf
      balances.pillar3a = snapshot.pillar3a
      balances.pillar2  = snapshot.pillar2
    }

    const entries = rows.map(t => ({
      month:        dayKey(new Date(t.date)).slice(0, 7),
      amount:       t.amount,
      categoryType: t.category?.type ?? null,
      categoryId:   t.category?.id ?? null,
      categoryName: t.category?.name ?? null,
    }))
    // Complete months only: the window ends before the month of the latest import.
    const today = dayKey(new Date())
    const lastImport = latest ? dayKey(new Date(latest.importedAt)) : today
    const months = driftWindow([...new Set(entries.map(e => e.month))], lastImport < today ? lastImport : today, PACE_MONTHS)
    const pillar2Monthly = Number(pillar2?.value ?? DEFAULT_SETTINGS.monthlyPillar2) || 0

    return NextResponse.json({
      goals,
      balances,
      balanceMonth: snapshot ? `${snapshot.month.getFullYear()}-${String(snapshot.month.getMonth() + 1).padStart(2, "0")}` : null,
      pace: savingsPace(entries, months, pillar2Monthly, assetOf),
      paceMonths: months,
      savingsCategories: categories.map(c => ({ ...c, asset: assetOf(c.id, c.name) })),
    })
  } catch (error) {
    console.error("Goals error:", error)
    return NextResponse.json({ error: "Failed to load goals" }, { status: 500 })
  }
}

type GoalBody = {
  name: string; kind: string; target: number; targetDate: string | null
  params: string | null; allocations: Allocation[]
}

// Checks a goal sent by the page; returns an error message or the clean values.
function parseGoal(body: unknown): GoalBody | string {
  const b = (body ?? {}) as Record<string, unknown>
  const name = typeof b.name === "string" ? b.name.trim() : ""
  if (!name || name.length > 60) return "name is required (up to 60 characters)"
  if (!isGoalKind(b.kind)) return "unknown kind"
  const target = Number(b.target)
  if (!Number.isFinite(target) || target < 0) return "target must be a number ≥ 0"
  const targetDate = b.targetDate == null || b.targetDate === "" ? null : String(b.targetDate)
  if (targetDate && !/^\d{4}-\d{2}$/.test(targetDate)) return "targetDate must be YYYY-MM"
  if (!Array.isArray(b.allocations)) return "allocations must be a list"
  const allocations: Allocation[] = []
  for (const a of b.allocations as Record<string, unknown>[]) {
    const value = Number(a?.value)
    if (!isAssetKey(a?.asset) || (a.mode !== "percent" && a.mode !== "amount")) return "invalid allocation"
    if (!Number.isFinite(value) || value < 0 || (a.mode === "percent" && value > 100)) {
      return "allocation values must be ≥ 0 (and at most 100%)"
    }
    allocations.push({ asset: a.asset, mode: a.mode, value })
  }
  const params = b.params == null ? null : JSON.stringify(b.params)
  return { name, kind: b.kind, target, targetDate, params, allocations }
}

// PATCH { categoryId, asset }: which asset a savings category feeds.
export async function PATCH(req: NextRequest) {
  try {
    await ensureSettingTable()
    const { categoryId, asset } = await req.json().catch(() => ({}))
    if (!Number.isInteger(categoryId) || !isAssetKey(asset) || asset === "checking") {
      return NextResponse.json({ error: "Send { categoryId, asset } (asset other than checking)" }, { status: 400 })
    }
    const key = SOURCE_KEY + categoryId
    await prisma.setting.upsert({ where: { key }, create: { key, value: asset }, update: { value: asset } })
    return NextResponse.json({ categoryId, asset })
  } catch (error) {
    console.error("Goal source error:", error)
    return NextResponse.json({ error: "Failed to save" }, { status: 500 })
  }
}

// POST: create a goal (added at the end).
export async function POST(req: NextRequest) {
  try {
    await ensureGoalTables()
    const goal = parseGoal(await req.json().catch(() => null))
    if (typeof goal === "string") return NextResponse.json({ error: goal }, { status: 400 })
    const last = await prisma.goal.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } })
    const { allocations, ...data } = goal
    const created = await prisma.goal.create({
      data: { ...data, sortOrder: (last?.sortOrder ?? 0) + 1, allocations: { create: allocations } },
    })
    return NextResponse.json({ id: created.id })
  } catch (error) {
    console.error("Goal create error:", error)
    return NextResponse.json({ error: "Failed to create goal" }, { status: 500 })
  }
}

// PUT { id, ...goal }: replace a goal and its allocations.
export async function PUT(req: NextRequest) {
  try {
    await ensureGoalTables()
    const body = await req.json().catch(() => null)
    const id = Number(body?.id)
    if (!Number.isInteger(id)) return NextResponse.json({ error: "id is required" }, { status: 400 })
    const goal = parseGoal(body)
    if (typeof goal === "string") return NextResponse.json({ error: goal }, { status: 400 })
    const { allocations, ...data } = goal
    await prisma.$transaction([
      prisma.goalAllocation.deleteMany({ where: { goalId: id } }),
      prisma.goal.update({ where: { id }, data: { ...data, allocations: { create: allocations } } }),
    ])
    return NextResponse.json({ id })
  } catch (error) {
    console.error("Goal update error:", error)
    return NextResponse.json({ error: "Failed to update goal" }, { status: 500 })
  }
}

// DELETE ?id=…
export async function DELETE(req: NextRequest) {
  try {
    await ensureGoalTables()
    const id = Number(new URL(req.url).searchParams.get("id"))
    if (!Number.isInteger(id)) return NextResponse.json({ error: "id is required" }, { status: 400 })
    await prisma.$transaction([
      prisma.goalAllocation.deleteMany({ where: { goalId: id } }),
      prisma.goal.delete({ where: { id } }),
    ])
    return NextResponse.json({ deleted: id })
  } catch (error) {
    console.error("Goal delete error:", error)
    return NextResponse.json({ error: "Failed to delete goal" }, { status: 500 })
  }
}
