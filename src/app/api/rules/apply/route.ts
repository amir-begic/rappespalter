import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { planRuleChanges } from "@/lib/rules-store"

// Re-categorize existing transactions according to the rules:
// POST { ruleId? } — one rule's transactions, or every rule's when omitted.
// This overwrites categories set by hand on those transactions.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const ruleId = body?.ruleId == null ? undefined : Number(body.ruleId)
    if (ruleId !== undefined && !Number.isInteger(ruleId)) {
      return NextResponse.json({ error: "ruleId must be an integer" }, { status: 400 })
    }

    const { rules, byRule } = await planRuleChanges(ruleId)
    const updates = rules
      .map(r => ({ categoryId: r.categoryId, ids: byRule.get(r.id)?.changes ?? [] }))
      .filter(u => u.ids.length)
    const results = await prisma.$transaction(updates.map(u =>
      prisma.transaction.updateMany({ where: { id: { in: u.ids } }, data: { categoryId: u.categoryId } })
    ))
    return NextResponse.json({ updated: results.reduce((s, r) => s + r.count, 0) })
  } catch (error) {
    console.error("Rule apply error:", error)
    return NextResponse.json({ error: "Failed to apply rules" }, { status: 500 })
  }
}
