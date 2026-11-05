import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { BUDGETABLE_TYPES, CATEGORY_PALETTE, isCategoryType, isHexColor } from "@/lib/categories"

const include = {
  budget: true,
  _count: { select: { transactions: true } },
} as const

export async function GET() {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      include,
    })

    return NextResponse.json({ categories })

  } catch (error) {
    console.error("Categories fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    )
  }
}

// Validates name/type/color for create and update. Returns an error message,
// or null when the given fields are valid. Names are unique case-insensitively.
async function validate(
  fields: { name?: unknown; type?: unknown; color?: unknown },
  excludeId?: number,
): Promise<string | null> {
  if (fields.name !== undefined) {
    const name = typeof fields.name === "string" ? fields.name.trim() : ""
    if (!name || name.length > 40) return "Name must be 1–40 characters"
    const all = await prisma.category.findMany({ select: { id: true, name: true } })
    if (all.some(c => c.id !== excludeId && c.name.toLowerCase() === name.toLowerCase())) {
      return `A category named "${name}" already exists`
    }
  }
  if (fields.type !== undefined && !isCategoryType(fields.type)) {
    return "Type must be fixed, variable, income, savings or transfer"
  }
  if (fields.color !== undefined && !isHexColor(fields.color)) {
    return "Color must be a hex value like #8ab4d4"
  }
  return null
}

// Create a category: { name, type, color? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (body?.name === undefined || body?.type === undefined) {
      return NextResponse.json({ error: "name and type are required" }, { status: 400 })
    }
    const invalid = await validate(body)
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

    let color = body.color as string | undefined
    if (!color) {
      const used = new Set((await prisma.category.findMany({ select: { color: true } })).map(c => c.color.toLowerCase()))
      color = CATEGORY_PALETTE.find(c => !used.has(c)) ?? CATEGORY_PALETTE[0]
    }

    const category = await prisma.category.create({
      data: { name: body.name.trim(), type: body.type, color },
      include,
    })
    return NextResponse.json({ category })

  } catch (error) {
    console.error("Category create error:", error)
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 })
  }
}

// Update a category: { id, name?, type?, color? }. Switching to a type that
// can't have a budget (income/savings/transfer) removes its budget.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const id = Number(body?.id)
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }
    const existing = await prisma.category.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Category not found" }, { status: 404 })

    const invalid = await validate(body, id)
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

    const data = {
      ...(body.name  !== undefined ? { name: body.name.trim() } : {}),
      ...(body.type  !== undefined ? { type: body.type } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
    }
    const dropBudget = body.type !== undefined && !BUDGETABLE_TYPES.has(body.type)

    const [category] = await prisma.$transaction([
      prisma.category.update({ where: { id }, data, include }),
      ...(dropBudget ? [prisma.budget.deleteMany({ where: { categoryId: id } })] : []),
    ])
    return NextResponse.json({ category: dropBudget ? { ...category, budget: null } : category })

  } catch (error) {
    console.error("Category update error:", error)
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 })
  }
}

// Delete a category: DELETE /api/categories?id=12. Its transactions become
// uncategorized; its budget and rules are removed.
export async function DELETE(req: NextRequest) {
  try {
    const id = Number(new URL(req.url).searchParams.get("id"))
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "id query param is required" }, { status: 400 })
    }

    const [, , , deleted] = await prisma.$transaction([
      prisma.categoryRule.deleteMany({ where: { categoryId: id } }),
      prisma.budget.deleteMany({ where: { categoryId: id } }),
      prisma.transaction.updateMany({ where: { categoryId: id }, data: { categoryId: null } }),
      prisma.category.deleteMany({ where: { id } }),
    ])
    if (deleted.count === 0) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })

  } catch (error) {
    console.error("Category delete error:", error)
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 })
  }
}
