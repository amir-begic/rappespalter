import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseRaiffeisenXLSX } from "@/lib/parser"
import { CamtFormatError, parseCamt } from "@/lib/camt"
import { findRule } from "@/lib/rules"
import { setMarks, type CategorySource } from "@/lib/marks"
import { TRANSFER_CATEGORY } from "@/lib/parser"
import { TRANSFER_WINDOW_DAYS, findTransferPairs } from "@/lib/transfers"
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

    // A Raiffeisen Finanzassistent export (.xlsx), or a camt statement from any
    // bank (.xml, or several in a .zip).
    const name = file.name.toLowerCase()
    const format = name.endsWith(".xlsx") ? "raiffeisen"
      : name.endsWith(".xml") || name.endsWith(".zip") ? "camt"
      : null
    if (!format) {
      return NextResponse.json(
        { error: t("err.unsupportedImport") },
        { status: 400 }
      )
    }

    // Convert File to Buffer for the parser
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Parse the file into normalized transaction objects
    let parsed
    try {
      parsed = format === "raiffeisen" ? parseRaiffeisenXLSX(buffer) : parseCamt(buffer, name)
    } catch (e) {
      if (e instanceof CamtFormatError) {
        return NextResponse.json({ error: t("err.notCamt") }, { status: 400 })
      }
      throw e
    }

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
    const typeOf = new Map(categories.map(c => [c.id, c.type]))

    // The user's own rules take precedence over the parser's category mapping.
    const rules = await prisma.categoryRule.findMany()

    // Where movements between own accounts go: the transfer-type category,
    // created (as the default "Internal Transfer") only when one is needed.
    let transferId: number | null = categories.find(c => c.name === TRANSFER_CATEGORY && c.type === "transfer")?.id
      ?? categories.find(c => c.type === "transfer")?.id ?? null
    const transferCategory = async () => {
      if (transferId == null) {
        const created = await prisma.category.upsert({
          where:  { name: TRANSFER_CATEGORY },
          update: { type: "transfer" },
          create: { name: TRANSFER_CATEGORY, color: "#9e9e9e", type: "transfer" },
        })
        transferId = created.id
        typeOf.set(created.id, "transfer")
      }
      return transferId
    }

    const decided: { categoryId: number | null; categorySource: CategorySource; byRule: boolean }[] = []
    for (const tx of parsed) {
      const rule = findRule(rules, tx)
      decided.push(
        rule                               ? { categoryId: rule.categoryId, categorySource: "rule", byRule: true }
        : tx.categorySource === "transfer" ? { categoryId: await transferCategory(), categorySource: "transfer", byRule: false }
        : {
            categoryId: tx.categories.map(name => categoryMap.get(name)).find(id => id != null) ?? null,
            categorySource: tx.categorySource,
            byRule: false,
          },
      )
    }

    // The same amount out of one account and into another within a few days
    // is a transfer between own accounts, whatever the counterparty is called.
    // Checked against what's already imported too (another account's export
    // may have come earlier). Rules and hand-set categories are never changed,
    // and an outgoing savings payment stays savings: only its incoming half on
    // the savings account becomes a transfer (it isn't income).
    const dates = parsed.map(tx => tx.date.getTime())
    const window = TRANSFER_WINDOW_DAYS * 86_400_000
    const existing = await prisma.transaction.findMany({
      where:  { date: { gte: new Date(Math.min(...dates) - window), lte: new Date(Math.max(...dates) + window) } },
      select: { id: true, date: true, amount: true, currency: true, account: true, sourceHash: true, categoryId: true,
                mark: { select: { categorySource: true } } },
    })
    const existingHashes = new Set(existing.map(e => e.sourceHash))
    const candidates = [
      ...existing.map(e => ({ ...e, index: -1, source: e.mark?.categorySource ?? null })),
      ...parsed.flatMap((tx, index) => existingHashes.has(tx.sourceHash) ? [] : [{
        ...tx, id: -1, index, categoryId: decided[index].categoryId, source: decided[index].categorySource as string | null,
      }]),
    ]
    const existingToTransfer: number[] = []
    for (const pair of findTransferPairs(candidates)) {
      for (const c of pair.map(i => candidates[i])) {
        const type = c.categoryId != null ? typeOf.get(c.categoryId) : undefined
        if (c.source === "rule" || c.source === "manual" || type === "transfer") continue
        if (c.amount < 0 && type === "savings") continue
        if (c.index >= 0) {
          decided[c.index] = { categoryId: await transferCategory(), categorySource: "transfer", byRule: false }
        } else if (c.source === "bank" || c.source === "fallback") {
          // Not rows without a recorded source: they predate it and may be hand-set.
          existingToTransfer.push(c.id)
        }
      }
    }
    if (existingToTransfer.length) {
      await prisma.transaction.updateMany({ where: { id: { in: existingToTransfer } }, data: { categoryId: await transferCategory() } })
      await setMarks(existingToTransfer, { categorySource: "transfer" })
    }

    let imported = 0
    let skipped = 0
    let byRule = 0
    let toReview = 0 // imported with the parser's fallback category
    let transfers = 0
    let uncategorized = 0 // imported without a category (camt has none)

    for (const [i, tx] of parsed.entries()) {
      const { categoryId, categorySource } = decided[i]
      const rule = decided[i].byRule

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
        if (categorySource === "transfer") transfers++
        if (categorySource === "fallback") toReview++
        if (categoryId == null) uncategorized++
      } catch (e) {
        // Unique constraint on sourceHash means this transaction
        // already exists — skip it, but fill in how its category would be
        // chosen if that isn't known yet (rows imported before it was recorded),
        // so re-importing an old export brings its guesses to the review inbox.
        if ((e as { code?: string }).code === "P2002") {
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
      transfers, // of the imported, how many are movements between own accounts
      uncategorized, // of the imported, how many have no category
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