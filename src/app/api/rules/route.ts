import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isDirection, isMatchType } from "@/lib/rules"
import { planRuleChanges } from "@/lib/rules-store"
import { settleSuggestions } from "@/lib/marks"

// Auto-categorization rules (see src/lib/rules.ts).
//   GET                    rules with how many transactions each decides and would change
//   POST   { pattern, matchType?, direction?, categoryId, apply? }
//   PATCH  { id, pattern?, matchType?, direction?, categoryId? }
//   DELETE ?id=3
// Applying to existing transactions: POST /api/rules/apply.

export async function GET() {
  try {
    const { rules, byRule } = await planRuleChanges()
    const categories = new Map((await prisma.category.findMany()).map(c => [c.id, c]))
    return NextResponse.json({
      rules: rules
        .map(r => ({
          ...r,
          category: categories.get(r.categoryId) ?? null,
          matches:  byRule.get(r.id)?.matches ?? 0,
          pending:  byRule.get(r.id)?.changes.length ?? 0,
        }))
        .sort((a, b) => a.pattern.localeCompare(b.pattern)),
    })
  } catch (error) {
    console.error("Rules fetch error:", error)
    return NextResponse.json({ error: "Failed to load rules" }, { status: 500 })
  }
}

type RuleInput = { pattern?: unknown; matchType?: unknown; direction?: unknown; categoryId?: unknown }

async function validate(body: RuleInput, partial: boolean) {
  const data: { pattern?: string; matchType?: string; direction?: string; categoryId?: number } = {}
  if (body.pattern !== undefined || !partial) {
    const pattern = String(body.pattern ?? "").trim()
    if (pattern.length < 2) return { error: "pattern needs at least 2 characters" }
    data.pattern = pattern
  }
  if (body.matchType !== undefined) {
    if (!isMatchType(body.matchType)) return { error: "matchType must be contains, startsWith or equals" }
    data.matchType = body.matchType
  }
  if (body.direction !== undefined) {
    if (!isDirection(body.direction)) return { error: "direction must be any, in or out" }
    data.direction = body.direction
  }
  if (body.categoryId !== undefined || !partial) {
    const categoryId = Number(body.categoryId)
    if (!Number.isInteger(categoryId) || !(await prisma.category.findUnique({ where: { id: categoryId } }))) {
      return { error: "categoryId must be an existing category" }
    }
    data.categoryId = categoryId
  }
  return { data }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { data, error } = await validate(body, false)
    if (error) return NextResponse.json({ error }, { status: 400 })
    const rule = await prisma.categoryRule.create({
      data: { pattern: data!.pattern!, categoryId: data!.categoryId!, matchType: data!.matchType, direction: data!.direction },
    })

    // Optionally re-categorize existing transactions this rule now decides.
    let applied = 0
    if (body.apply) {
      const ids = (await planRuleChanges(rule.id)).byRule.get(rule.id)?.changes ?? []
      if (ids.length) {
        applied = (await prisma.transaction.updateMany({ where: { id: { in: ids } }, data: { categoryId: rule.categoryId } })).count
        await settleSuggestions(ids)
      }
    }
    return NextResponse.json({ rule, applied })
  } catch (error) {
    console.error("Rule create error:", error)
    return NextResponse.json({ error: "Failed to create rule" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const id = Number(body?.id)
    if (!Number.isInteger(id)) return NextResponse.json({ error: "id is required" }, { status: 400 })
    const { data, error } = await validate(body, true)
    if (error) return NextResponse.json({ error }, { status: 400 })
    const updated = await prisma.categoryRule.updateMany({ where: { id }, data: data! })
    if (updated.count === 0) return NextResponse.json({ error: "Rule not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Rule update error:", error)
    return NextResponse.json({ error: "Failed to update rule" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = Number(new URL(req.url).searchParams.get("id"))
    if (!Number.isInteger(id)) return NextResponse.json({ error: "id query param is required" }, { status: 400 })
    await prisma.categoryRule.deleteMany({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Rule delete error:", error)
    return NextResponse.json({ error: "Failed to delete rule" }, { status: 500 })
  }
}
