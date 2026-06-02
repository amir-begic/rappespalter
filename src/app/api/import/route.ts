import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseRaiffeisenXLSX } from "@/lib/parser"

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    if (!file.name.endsWith(".xlsx")) {
      return NextResponse.json(
        { error: "File must be a .xlsx export from Raiffeisen" },
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
        { error: "No transactions found in file" },
        { status: 400 }
      )
    }

    // Load all categories into a name → id map
    const categories = await prisma.category.findMany()
    const categoryMap = new Map(
      categories.map(c => [c.name, c.id])
    )

    let imported = 0
    let skipped = 0

    for (const tx of parsed) {
      const categoryId = categoryMap.get(tx.category) ?? null

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
          },
        })
        imported++
      } catch (e: any) {
        // Unique constraint on sourceHash means this transaction
        // already exists — skip it silently
        if (e.code === "P2002") {
          skipped++
        } else {
          throw e
        }
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      total: parsed.length,
    })

  } catch (error) {
    console.error("Import error:", error)
    return NextResponse.json(
      { error: "Failed to process file" },
      { status: 500 }
    )
  }
}