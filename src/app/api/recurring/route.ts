import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { NOT_ONE_OFF } from "@/lib/marks"
import { resolveCounterparty } from "@/lib/counterparty"
import { findRecurring } from "@/lib/recurring"

// Local (Swiss) calendar date, matching how months are derived elsewhere in the app.
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

// Recurring payments and income (src/lib/recurring.ts), judged as of the latest
// import — anything after it isn't in the data yet. One-offs are left out.
export async function GET() {
  try {
    const [rows, latest] = await Promise.all([
      prisma.transaction.findMany({
        where:  NOT_ONE_OFF,
        select: {
          date: true, counterparty: true, amount: true, bookingText: true,
          category: { select: { name: true, color: true, type: true } },
        },
      }),
      prisma.transaction.findFirst({ orderBy: { importedAt: "desc" }, select: { importedAt: true } }),
    ])

    const today = dayKey(new Date())
    const lastImport = latest ? dayKey(new Date(latest.importedAt)) : today
    return NextResponse.json(findRecurring(rows.map(t => ({
      date:         dayKey(new Date(t.date)),
      // Rows imported before the parser resolved bare "Dauerauftrag" labels.
      counterparty: resolveCounterparty(t.counterparty, t.bookingText ?? ""),
      amount:       t.amount,
      category:     t.category?.name ?? null,
      color:        t.category?.color ?? null,
      categoryType: t.category?.type ?? null,
    })), lastImport < today ? lastImport : today))
  } catch (error) {
    console.error("Recurring error:", error)
    return NextResponse.json({ error: "Failed to find recurring payments" }, { status: 500 })
  }
}
