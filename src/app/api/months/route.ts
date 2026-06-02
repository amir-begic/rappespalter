import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const transactions = await prisma.transaction.findMany({
      select: { date: true },
      orderBy: { date: "desc" },
    })

    // Extract unique YYYY-MM strings
    const months = Array.from(
      new Set(
        transactions.map(t => {
          const d = new Date(t.date)
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        })
      )
    ).sort((a, b) => b.localeCompare(a)) // newest first

    return NextResponse.json({ months })

  } catch (error) {
    console.error("Months fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch months" },
      { status: 500 }
    )
  }
}   