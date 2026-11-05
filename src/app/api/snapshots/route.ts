import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const from = searchParams.get("from")
    const to   = searchParams.get("to")

    const where: { month?: { gte?: Date; lte?: Date } } = {}

    if (from) {
      const [year, mon] = from.split("-").map(Number)
      where.month = { ...where.month, gte: new Date(year, mon - 1, 1) }
    }

    if (to) {
      const [year, mon] = to.split("-").map(Number)
      where.month = { ...where.month, lte: new Date(year, mon - 1, 1) }
    }

    const snapshots = await prisma.snapshot.findMany({
      where,
      orderBy: { month: "asc" },
    })

    const enriched = snapshots.map(s => ({
      ...s,
      total: s.etf + s.savings + s.pillar3a + s.pillar2 + s.checking,
    }))

    return NextResponse.json({ snapshots: enriched })

  } catch (error) {
    console.error("Snapshots fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch snapshots" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { month, etf, savings, pillar3a, pillar2, checking, notes } = body

    if (!month) {
      return NextResponse.json(
        { error: "month is required (format: YYYY-MM)" },
        { status: 400 }
      )
    }

    const [year, mon] = month.split("-").map(Number)
    const monthDate = new Date(year, mon - 1, 1)

    // Upsert — update if this month already exists, create if not
    const snapshot = await prisma.snapshot.upsert({
      where:  { month: monthDate },
      update: {
        etf:      etf      ?? 0,
        savings:  savings  ?? 0,
        pillar3a: pillar3a ?? 0,
        pillar2:  pillar2  ?? 0,
        checking: checking ?? 0,
        notes:    notes    ?? null,
      },
      create: {
        month:    monthDate,
        etf:      etf      ?? 0,
        savings:  savings  ?? 0,
        pillar3a: pillar3a ?? 0,
        pillar2:  pillar2  ?? 0,
        checking: checking ?? 0,
        notes:    notes    ?? null,
      },
    })

    const total = snapshot.etf + snapshot.savings +
                  snapshot.pillar3a + snapshot.pillar2 + snapshot.checking

    return NextResponse.json({ snapshot: { ...snapshot, total } })

  } catch (error) {
    console.error("Snapshot save error:", error)
    return NextResponse.json(
      { error: "Failed to save snapshot" },
      { status: 500 }
    )
  }
}