import { NextRequest, NextResponse } from "next/server"
import { parseProfile } from "@/lib/tax-estimate"
import { saveTaxProfile } from "@/lib/tax-estimate-store"

// PUT { profile: TaxProfile } → { profile }: the municipality, marital status,
// children and church the tax estimate uses. Invalid fields fall back to defaults.
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body?.profile || typeof body.profile !== "object") {
      return NextResponse.json({ error: "Body must be { profile: {...} }" }, { status: 400 })
    }
    const profile = parseProfile(body.profile)
    await saveTaxProfile(profile)
    return NextResponse.json({ profile })
  } catch (error) {
    console.error("Tax profile save error:", error)
    return NextResponse.json({ error: "Failed to save the tax profile" }, { status: 500 })
  }
}
