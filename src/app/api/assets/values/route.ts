import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// POST { assetId, date, value }: record what an asset is worth on a day. A second
// valuation on the same day replaces the first.
export async function POST(req: NextRequest) {
  try {
    const { assetId, date, value } = await req.json().catch(() => ({}))
    const v = Number(value)
    if (!Number.isInteger(assetId) || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(v) || v < 0) {
      return NextResponse.json({ error: "Send { assetId, date: YYYY-MM-DD, value ≥ 0 }" }, { status: 400 })
    }
    const [, created] = await prisma.$transaction([
      prisma.assetValue.deleteMany({ where: { assetId, date } }),
      prisma.assetValue.create({ data: { assetId, date, value: v } }),
    ])
    return NextResponse.json({ id: created.id })
  } catch (error) {
    console.error("Asset value error:", error)
    return NextResponse.json({ error: "Failed to save the value" }, { status: 500 })
  }
}

// DELETE ?id=…
export async function DELETE(req: NextRequest) {
  try {
    const id = Number(new URL(req.url).searchParams.get("id"))
    if (!Number.isInteger(id)) return NextResponse.json({ error: "id is required" }, { status: 400 })
    await prisma.assetValue.delete({ where: { id } })
    return NextResponse.json({ deleted: id })
  } catch (error) {
    console.error("Asset value delete error:", error)
    return NextResponse.json({ error: "Failed to delete the value" }, { status: 500 })
  }
}
