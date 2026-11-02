import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ensurePortfolioSchema } from "@/lib/portfolio/schema"

// Save target weights and fund fees for several securities at once:
// PUT { items: [{ symbol, targetWeight: 0.6 | null, ter: 0.0022 | null }] }
// Fractions, not percentages; null clears the value.
export async function PUT(req: NextRequest) {
  try {
    await ensurePortfolioSchema()
    const body = await req.json()
    const items: unknown[] = Array.isArray(body?.items) ? body.items : []
    const fraction = (v: unknown, max: number) =>
      v === null ? null : typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : undefined

    const updates = items.map(it => {
      const o = it as { symbol?: unknown; targetWeight?: unknown; ter?: unknown }
      return { symbol: String(o.symbol ?? ""), targetWeight: fraction(o.targetWeight, 1), ter: fraction(o.ter, 0.05) }
    })
    const bad = updates.find(u => !u.symbol || u.targetWeight === undefined || u.ter === undefined)
    if (bad || !updates.length) {
      return NextResponse.json({ error: "Each item needs a symbol, targetWeight (0–1 or null) and ter (0–0.05 or null)" }, { status: 400 })
    }
    const known = new Set((await prisma.security.findMany({ select: { symbol: true } })).map(s => s.symbol))
    const unknown = updates.find(u => !known.has(u.symbol))
    if (unknown) return NextResponse.json({ error: `Unknown security "${unknown.symbol}"` }, { status: 404 })

    await prisma.$transaction(updates.map(u => prisma.security.update({
      where: { symbol: u.symbol }, data: { targetWeight: u.targetWeight, ter: u.ter },
    })))
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Targets save error:", error)
    return NextResponse.json({ error: "Failed to save targets" }, { status: 500 })
  }
}
