import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { setMark, type MarkPatch } from "@/lib/marks"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    // Optional filters
    const month     = searchParams.get("month")     // e.g. "2026-03"
    const from      = searchParams.get("from")       // e.g. "2026-01" (inclusive)
    const to        = searchParams.get("to")         // e.g. "2026-12" (inclusive)
    const category  = searchParams.get("category")  // e.g. "Groceries"
    const account   = searchParams.get("account")   // e.g. "VISA •••• 1234"
    const minAmount = searchParams.get("minAmount")
    const maxAmount = searchParams.get("maxAmount")
    const search    = searchParams.get("search")    // counterparty search
    const type      = searchParams.get("type")      // "income" | "expense"
    const page      = parseInt(searchParams.get("page")  ?? "1")
    const limit     = parseInt(searchParams.get("limit") ?? "50")

    // Build filter object dynamically based on provided params
    const where: {
      date?:         { gte?: Date; lt?: Date }
      categoryId?:   null
      category?:     { name: string }
      account?:      { contains: string }
      amount?:       { gte?: number; lte?: number; gt?: number; lt?: number }
      counterparty?: { contains: string }
    } = {}

    if (month) {
      const [year, mon] = month.split("-").map(Number)
      where.date = {
        gte: new Date(year, mon - 1, 1),
        lt:  new Date(year, mon, 1),
      }
    } else if (from || to) {
      where.date = {}
      if (from) {
        const [y, m] = from.split("-").map(Number)
        where.date.gte = new Date(y, m - 1, 1)
      }
      if (to) {
        const [y, m] = to.split("-").map(Number)
        where.date.lt = new Date(y, m, 1) // first of the month after `to`
      }
    }

    if (category === "__uncategorized__") {
      where.categoryId = null
    } else if (category) {
      where.category = { name: category }
    }

    if (account) {
      where.account = { contains: account }
    }

    if (minAmount || maxAmount) {
      where.amount = {}
      if (minAmount) where.amount.gte = parseFloat(minAmount)
      if (maxAmount) where.amount.lte = parseFloat(maxAmount)
    }

    if (search) {
      where.counterparty = { contains: search }
    }

    if (type === "income") {
      where.amount = { ...where.amount, gt: 0 }
    } else if (type === "expense") {
      where.amount = { ...where.amount, lt: 0 }
    }

    // Run count and data fetch in parallel
    const [total, transactions] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        include: { category: true, mark: true },
        orderBy: { date: "desc" },
        skip:  (page - 1) * limit,
        take:  limit,
      }),
    ])

    return NextResponse.json({
      transactions,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    })

  } catch (error) {
    console.error("Transactions fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    )
  }
}

// Update a single transaction (Data tab, review inbox):
// { id, categoryId?: number | null, oneOff?: boolean, reviewed?: boolean }.
// Setting the category by hand also counts as reviewing it.
export async function PATCH(req: NextRequest) {
  try {
    const { id, categoryId, oneOff, reviewed } = await req.json()

    if (typeof id !== "number") {
      return NextResponse.json({ error: "id is required (number)" }, { status: 400 })
    }
    if (categoryId !== undefined && categoryId !== null && typeof categoryId !== "number") {
      return NextResponse.json({ error: "categoryId must be a number or null" }, { status: 400 })
    }
    if (oneOff !== undefined && typeof oneOff !== "boolean") {
      return NextResponse.json({ error: "oneOff must be a boolean" }, { status: 400 })
    }
    if (reviewed !== undefined && typeof reviewed !== "boolean") {
      return NextResponse.json({ error: "reviewed must be a boolean" }, { status: 400 })
    }

    const patch: MarkPatch = {}
    if (oneOff !== undefined) patch.oneOff = oneOff
    if (reviewed !== undefined) patch.reviewedAt = reviewed ? new Date() : null
    if (categoryId !== undefined) { patch.categorySource = "manual"; patch.reviewedAt = new Date() }

    if (categoryId !== undefined) {
      await prisma.transaction.update({ where: { id }, data: { categoryId } })
    }
    if (Object.keys(patch).length) await setMark(id, patch)

    const transaction = await prisma.transaction.findUnique({
      where:   { id },
      include: { category: true, mark: true },
    })
    return NextResponse.json({ transaction })

  } catch (error) {
    console.error("Transaction update error:", error)
    return NextResponse.json(
      { error: "Failed to update transaction" },
      { status: 500 }
    )
  }
}
