import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { loadAssets, loadLiabilities } from "@/lib/assets-store"
import { COLLECTIBLE_TYPES, isAssetKind, kindInfo } from "@/lib/assets"

// Local (Swiss) calendar date.
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

// GET: every asset with its valuations, every loan/lease, and today's date. Values
// and balances are worked out on the page (src/lib/assets.ts).
export async function GET() {
  try {
    const [assets, liabilities] = await Promise.all([loadAssets(), loadLiabilities()])
    return NextResponse.json({ assets, liabilities, today: dayKey(new Date()) })
  } catch (error) {
    console.error("Assets error:", error)
    return NextResponse.json({ error: "Failed to load assets" }, { status: 500 })
  }
}

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)

// An optional number ≥ 0: null when empty, NaN when invalid.
function optional(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : NaN
}

type AssetBody = {
  name: string; kind: string; subtype: string | null; valuation: string
  quantity: number | null; unit: string | null
  purchaseDate: string | null; purchasePrice: number | null
  depreciationRate: number | null; residualValue: number | null
  soldDate: string | null; soldPrice: number | null
  costCategories: string | null; notes: string | null
}

// Checks an asset sent by the page; returns an error message or the clean values.
function parseAsset(body: unknown): AssetBody | string {
  const b = (body ?? {}) as Record<string, unknown>
  const name = typeof b.name === "string" ? b.name.trim() : ""
  if (!name || name.length > 60) return "name is required (up to 60 characters)"
  if (!isAssetKind(b.kind)) return "unknown kind"
  const valuation = b.valuation === "depreciation" ? "depreciation" : "manual"

  const nums = {
    quantity: optional(b.quantity), purchasePrice: optional(b.purchasePrice),
    depreciationRate: optional(b.depreciationRate), residualValue: optional(b.residualValue),
    soldPrice: optional(b.soldPrice),
  }
  const bad = Object.entries(nums).find(([, v]) => Number.isNaN(v))
  if (bad) return `${bad[0]} must be a number ≥ 0`
  if (nums.depreciationRate != null && nums.depreciationRate >= 1) return "depreciationRate is a share a year (0.15 = 15%)"

  const day = (v: unknown) => v == null || v === "" ? null : isDay(v) ? v : undefined
  const purchaseDate = day(b.purchaseDate), soldDate = day(b.soldDate)
  if (purchaseDate === undefined || soldDate === undefined) return "dates must be YYYY-MM-DD"
  if (purchaseDate && soldDate && soldDate < purchaseDate) return "sold before it was bought"
  if (valuation === "depreciation" && (!purchaseDate || nums.purchasePrice == null)) {
    return "depreciation needs a purchase date and price"
  }

  const text = (v: unknown, max: number) => typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null
  const subtype = b.kind === "collectible" ? text(b.subtype, 40) ?? COLLECTIBLE_TYPES[0] : null
  const ids = Array.isArray(b.costCategories) ? b.costCategories.filter(Number.isInteger) : []

  return {
    name, kind: b.kind, subtype, valuation, ...nums,
    depreciationRate: valuation === "depreciation" ? nums.depreciationRate ?? kindInfo(b.kind).depreciation : null,
    unit: text(b.unit, 12), purchaseDate, soldDate,
    costCategories: ids.length ? JSON.stringify(ids) : null,
    notes: text(b.notes, 500),
  }
}

// POST: create an asset, with its first valuation when `value` is sent.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const asset = parseAsset(body)
    if (typeof asset === "string") return NextResponse.json({ error: asset }, { status: 400 })
    const value = optional(body?.value)
    if (Number.isNaN(value)) return NextResponse.json({ error: "value must be a number ≥ 0" }, { status: 400 })
    const date = isDay(body?.valueDate) ? body.valueDate : asset.purchaseDate ?? dayKey(new Date())
    const created = await prisma.asset.create({
      data: { ...asset, ...(value != null ? { values: { create: { date, value } } } : {}) },
    })
    return NextResponse.json({ id: created.id })
  } catch (error) {
    console.error("Asset create error:", error)
    return NextResponse.json({ error: "Failed to create asset" }, { status: 500 })
  }
}

// PUT { id, ...asset }: replace an asset's details (valuations stay).
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const id = Number(body?.id)
    if (!Number.isInteger(id)) return NextResponse.json({ error: "id is required" }, { status: 400 })
    const asset = parseAsset(body)
    if (typeof asset === "string") return NextResponse.json({ error: asset }, { status: 400 })
    await prisma.asset.update({ where: { id }, data: asset })
    return NextResponse.json({ id })
  } catch (error) {
    console.error("Asset update error:", error)
    return NextResponse.json({ error: "Failed to update asset" }, { status: 500 })
  }
}

// DELETE ?id=… (its valuations go too; loans against it stay, unlinked).
export async function DELETE(req: NextRequest) {
  try {
    const id = Number(new URL(req.url).searchParams.get("id"))
    if (!Number.isInteger(id)) return NextResponse.json({ error: "id is required" }, { status: 400 })
    await prisma.$transaction([
      prisma.assetValue.deleteMany({ where: { assetId: id } }),
      prisma.liability.updateMany({ where: { assetId: id }, data: { assetId: null } }),
      prisma.asset.delete({ where: { id } }),
    ])
    return NextResponse.json({ deleted: id })
  } catch (error) {
    console.error("Asset delete error:", error)
    return NextResponse.json({ error: "Failed to delete asset" }, { status: 500 })
  }
}
