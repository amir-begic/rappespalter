import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ensurePortfolioSchema } from "@/lib/portfolio/schema"
import { loadPortfolio } from "@/lib/portfolio/store"

export async function GET() {
  try {
    return NextResponse.json(await loadPortfolio())
  } catch (error) {
    console.error("Portfolio fetch error:", error)
    return NextResponse.json({ error: "Failed to load portfolio" }, { status: 500 })
  }
}

// Wipe all portfolio data (activities, securities, cached prices and rates).
// Bank transactions, snapshots and settings are untouched.
export async function DELETE() {
  try {
    await ensurePortfolioSchema()
    await prisma.$transaction([
      prisma.portfolioActivity.deleteMany(),
      prisma.securityPrice.deleteMany(),
      prisma.fxRate.deleteMany(),
      prisma.security.deleteMany(),
    ])
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Portfolio delete error:", error)
    return NextResponse.json({ error: "Failed to delete portfolio data" }, { status: 500 })
  }
}
