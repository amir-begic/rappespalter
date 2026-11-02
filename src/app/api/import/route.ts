import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseRaiffeisenXLSX } from "@/lib/parser"
import { findRule } from "@/lib/rules"
import { ensureRuleTable } from "@/lib/rules-store"
import { ensureMarkTable } from "@/lib/marks"
import { getT } from "@/lib/i18n/store"

export async function POST(req: NextRequest) {
  const { t } = await getT()
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json(
        { error: t("err.noFile") },
        { status: 400 }
      )
    }

    if (!file.name.endsWith(".xlsx")) {
      return NextResponse.json(
        { error: t("err.notXlsx") },
        { status: 400 }
      )
    }

    // Convert File to Buffer for the parser
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Parse the XLSX into normalized transaction objects
    const parsed = parseRaiffeisenXLSX(buffer)

    if (parsed.length === 0) {
      return NextResponse.json(
        { error: t("err.noTransactions") },
        { status: 400 }
      )
    }

    // Load all categories into a name → id map
    const categories = await prisma.category.findMany()
    const categoryMap = new Map(
      categories.map(c => [c.name, c.id])
    )

    // The user's own rules take precedence over the parser's category mapping.
    await ensureRuleTable()
    await ensureMarkTable()
    const rules = await prisma.categoryRule.findMany()

    let imported = 0
    let skipped = 0
    let byRule = 0
    let toReview = 0 // imported with the parser's fallback category

    for (const tx of parsed) {
      const rule = findRule(rules, tx)
      const categoryId = rule?.categoryId ?? categoryMap.get(tx.category) ?? null
      // Recorded per transaction so the review inbox can find the guesses.
      const categorySource = rule ? "rule" : tx.categorySource

      try {
        await prisma.transaction.create({
          data: {
            date:         tx.date,
            counterparty: tx.counterparty,
            amount:       tx.amount,
            currency:     tx.currency,
            account:      tx.account,
            categoryId,
            bookingText:  tx.bookingText,
            sourceHash:   tx.sourceHash,
            mark:         { create: { categorySource } },
          },
        })
        imported++
        if (rule) byRule++
        if (categorySource === "fallback") toReview++
      } catch (e: any) {
        // Unique constraint on sourceHash means this transaction
        // already exists — skip it, but fill in how its category would be
        // chosen if that isn't known yet (rows imported before it was recorded),
        // so re-importing an old export brings its guesses to the review inbox.
        if (e.code === "P2002") {
          skipped++
          const existing = await prisma.transaction.findUnique({
            where:  { sourceHash: tx.sourceHash },
            select: { id: true, mark: { select: { categorySource: true } } },
          })
          if (existing && !existing.mark?.categorySource) {
            await prisma.transactionMark.upsert({
              where:  { transactionId: existing.id },
              create: { transactionId: existing.id, categorySource },
              update: { categorySource },
            })
          }
        } else {
          throw e
        }
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      byRule, // of the imported, how many a rule categorized
      toReview, // of the imported, how many got the fallback category
      total: parsed.length,
    })

  } catch (error) {
    console.error("Import error:", error)
    return NextResponse.json(
      { error: t("err.processFailed") },
      { status: 500 }
    )
  }
}