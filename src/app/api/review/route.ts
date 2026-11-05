import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { setMarks } from "@/lib/marks"
import { FALLBACK_CATEGORY } from "@/lib/parser"
import type { Prisma } from "../../../../generated/prisma/client"

// The review inbox: transactions whose category nobody has confirmed —
//   uncategorized, or
//   given the parser's fallback category because the bank's wasn't recognised
//   (and still in it: a rule or a manual re-map takes it out).
// Confirming one ("Looks right") records reviewedAt, as does re-mapping it.
// "Recent" is the last RECENT_DAYS before the latest import: what's worth a look
// now (and counted on the nav badge); older items are a backlog to clear once.
const RECENT_DAYS = 90
async function inboxWhere(): Promise<Prisma.TransactionWhereInput> {
  const fallback = await prisma.category.findUnique({ where: { name: FALLBACK_CATEGORY }, select: { id: true } })
  const unreviewed: Prisma.TransactionWhereInput = { NOT: { mark: { is: { reviewedAt: { not: null } } } } }
  return {
    OR: [
      { categoryId: null, ...unreviewed },
      ...(fallback ? [{ categoryId: fallback.id, mark: { is: { categorySource: "fallback", reviewedAt: null } } }] : []),
    ],
  }
}

async function recentSince() {
  const latest = await prisma.transaction.findFirst({ orderBy: { importedAt: "desc" }, select: { importedAt: true } })
  const from = latest && latest.importedAt < new Date() ? latest.importedAt : new Date()
  return new Date(from.getTime() - RECENT_DAYS * 86_400_000)
}

// GET /api/review → { transactions, total, recent, recentSince };
// ?count=1 → the counts only (nav badge).
export async function GET(req: NextRequest) {
  try {
    const [where, since] = await Promise.all([inboxWhere(), recentSince()])
    const [total, recent] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.count({ where: { AND: [where, { date: { gte: since } }] } }),
    ])
    if (new URL(req.url).searchParams.get("count")) return NextResponse.json({ total, recent })

    const transactions = await prisma.transaction.findMany({
      where,
      include: { category: true, mark: true },
      orderBy: { date: "desc" },
      take:    2000,
    })
    return NextResponse.json({ transactions, total, recent, recentSince: since.toISOString() })
  } catch (error) {
    console.error("Review inbox error:", error)
    return NextResponse.json({ error: "Failed to load the review inbox" }, { status: 500 })
  }
}

// POST { ids: number[] } marks those transactions reviewed; { all: true } marks
// everything currently in the inbox. With categoryId (number or null) the ids
// are re-mapped to it at the same time, as if each had been set by hand.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    let ids: number[]
    if (body?.all === true) {
      ids = (await prisma.transaction.findMany({ where: await inboxWhere(), select: { id: true } })).map(t => t.id)
    } else if (Array.isArray(body?.ids) && body.ids.every((id: unknown) => Number.isInteger(id))) {
      ids = body.ids
    } else {
      return NextResponse.json({ error: "Send { ids: number[] } or { all: true }" }, { status: 400 })
    }
    const categoryId = body?.categoryId
    if (categoryId !== undefined) {
      if (categoryId !== null && !Number.isInteger(categoryId)) {
        return NextResponse.json({ error: "categoryId must be an integer or null" }, { status: 400 })
      }
      await prisma.transaction.updateMany({ where: { id: { in: ids } }, data: { categoryId } })
      await setMarks(ids, { reviewedAt: new Date(), categorySource: "manual" })
    } else {
      await setMarks(ids, { reviewedAt: new Date() })
    }
    return NextResponse.json({ reviewed: ids.length })
  } catch (error) {
    console.error("Review update error:", error)
    return NextResponse.json({ error: "Failed to update the review inbox" }, { status: 500 })
  }
}
