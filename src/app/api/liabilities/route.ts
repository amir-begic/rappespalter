import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isLiabilityKind } from "@/lib/assets"

// Loans, mortgages and leases. Listed by GET /api/assets together with the assets.

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)

function optional(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : NaN
}

type LiabilityBody = {
  name: string; kind: string; assetId: number | null
  principal: number; rate: number; startDate: string; termMonths: number | null
  monthlyPayment: number | null; balloon: number
  balance: number | null; balanceDate: string | null
  counterparty: string | null; notes: string | null
}

function parseLiability(body: unknown): LiabilityBody | string {
  const b = (body ?? {}) as Record<string, unknown>
  const name = typeof b.name === "string" ? b.name.trim() : ""
  if (!name || name.length > 60) return "name is required (up to 60 characters)"
  if (!isLiabilityKind(b.kind)) return "unknown kind"
  if (!isDay(b.startDate)) return "startDate must be YYYY-MM-DD"

  const nums = {
    principal: optional(b.principal), rate: optional(b.rate), termMonths: optional(b.termMonths),
    monthlyPayment: optional(b.monthlyPayment), balloon: optional(b.balloon), balance: optional(b.balance),
  }
  const bad = Object.entries(nums).find(([, v]) => Number.isNaN(v))
  if (bad) return `${bad[0]} must be a number ≥ 0`
  if (nums.rate != null && nums.rate >= 1) return "rate is a share a year (0.049 = 4.9%)"
  if (nums.termMonths != null && (!Number.isInteger(nums.termMonths) || nums.termMonths < 1)) return "termMonths must be a whole number ≥ 1"
  if (b.kind === "lease" && (nums.monthlyPayment == null || nums.termMonths == null)) return "a lease needs a monthly payment and a term"
  if (b.kind !== "lease" && !nums.principal && nums.balance == null) return "enter the amount borrowed or a statement balance"

  const balanceDate = b.balanceDate == null || b.balanceDate === "" ? null : b.balanceDate
  if (balanceDate !== null && !isDay(balanceDate)) return "balanceDate must be YYYY-MM-DD"
  if ((nums.balance == null) !== (balanceDate == null)) return "a statement balance needs its date (and the other way round)"

  const assetId = b.assetId == null || b.assetId === "" ? null : Number(b.assetId)
  if (assetId !== null && !Number.isInteger(assetId)) return "invalid asset"
  const text = (v: unknown, max: number) => typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null

  return {
    name, kind: b.kind, assetId, startDate: b.startDate,
    principal: nums.principal ?? 0, rate: nums.rate ?? 0, termMonths: nums.termMonths,
    monthlyPayment: nums.monthlyPayment, balloon: nums.balloon ?? 0,
    balance: nums.balance, balanceDate,
    counterparty: text(b.counterparty, 60), notes: text(b.notes, 500),
  }
}

// POST: add a loan / lease.
export async function POST(req: NextRequest) {
  try {
    const liability = parseLiability(await req.json().catch(() => null))
    if (typeof liability === "string") return NextResponse.json({ error: liability }, { status: 400 })
    const created = await prisma.liability.create({ data: liability })
    return NextResponse.json({ id: created.id })
  } catch (error) {
    console.error("Liability create error:", error)
    return NextResponse.json({ error: "Failed to add" }, { status: 500 })
  }
}

// PUT { id, ...liability }
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const id = Number(body?.id)
    if (!Number.isInteger(id)) return NextResponse.json({ error: "id is required" }, { status: 400 })
    const liability = parseLiability(body)
    if (typeof liability === "string") return NextResponse.json({ error: liability }, { status: 400 })
    await prisma.liability.update({ where: { id }, data: liability })
    return NextResponse.json({ id })
  } catch (error) {
    console.error("Liability update error:", error)
    return NextResponse.json({ error: "Failed to save" }, { status: 500 })
  }
}

// DELETE ?id=…
export async function DELETE(req: NextRequest) {
  try {
    const id = Number(new URL(req.url).searchParams.get("id"))
    if (!Number.isInteger(id)) return NextResponse.json({ error: "id is required" }, { status: 400 })
    await prisma.liability.delete({ where: { id } })
    return NextResponse.json({ deleted: id })
  } catch (error) {
    console.error("Liability delete error:", error)
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
