import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const budgets = await prisma.budget.findMany({
      include: { category: true },
      orderBy: { category: { name: "asc" } },
    })

    return NextResponse.json({ budgets })

  } catch (error) {
    console.error("Budgets fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch budgets" },
      { status: 500 }
    )
  }
}

// Upsert one budget — { categoryId, monthlyLimit } — or many at once —
// { budgets: [{ categoryId, monthlyLimit }, ...] } (used to apply suggestions).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const items: unknown[] = Array.isArray(body?.budgets) ? body.budgets : [body]

    const parsed = items.map(it => {
      const o = it as { categoryId?: unknown; monthlyLimit?: unknown }
      return { categoryId: Number(o.categoryId), monthlyLimit: Number(o.monthlyLimit) }
    })

    if (parsed.some(p => !Number.isInteger(p.categoryId) || !Number.isFinite(p.monthlyLimit) || p.monthlyLimit < 0)) {
      return NextResponse.json(
        { error: "Each budget needs an integer categoryId and a monthlyLimit ≥ 0" },
        { status: 400 }
      )
    }

    // Reject unknown categories rather than failing on a foreign-key error.
    const validIds = new Set((await prisma.category.findMany({ select: { id: true } })).map(c => c.id))
    const unknown = parsed.find(p => !validIds.has(p.categoryId))
    if (unknown) {
      return NextResponse.json({ error: `Unknown categoryId ${unknown.categoryId}` }, { status: 400 })
    }

    const budgets = await prisma.$transaction(
      parsed.map(p =>
        prisma.budget.upsert({
          where:  { categoryId: p.categoryId },
          update: { monthlyLimit: p.monthlyLimit },
          create: { categoryId: p.categoryId, monthlyLimit: p.monthlyLimit },
        })
      )
    )

    return NextResponse.json({ budgets })

  } catch (error) {
    console.error("Budget save error:", error)
    return NextResponse.json({ error: "Failed to save budget" }, { status: 500 })
  }
}

// Remove a budget for a category: DELETE /api/budgets?categoryId=12
export async function DELETE(req: NextRequest) {
  try {
    const categoryId = Number(new URL(req.url).searchParams.get("categoryId"))
    if (!Number.isInteger(categoryId)) {
      return NextResponse.json({ error: "categoryId query param is required" }, { status: 400 })
    }

    await prisma.budget.deleteMany({ where: { categoryId } })
    return NextResponse.json({ ok: true })

  } catch (error) {
    console.error("Budget delete error:", error)
    return NextResponse.json({ error: "Failed to delete budget" }, { status: 500 })
  }
}
