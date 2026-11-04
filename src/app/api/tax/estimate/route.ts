import { NextRequest, NextResponse } from "next/server"
import { EstvError, calculateTax } from "@/lib/estv"
import { getT } from "@/lib/i18n/store"
import { FIRST_ESTV_YEAR, sameRequest, taxRequest } from "@/lib/tax-estimate"
import { ageAtYearEnd, loadTaxEstimate, loadTaxProfile, saveTaxEstimate } from "@/lib/tax-estimate-store"

const isAmount = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e12

// POST { year, income, partnerIncome, wealth } → { estimate }: income and wealth tax
// for that year from the ESTV calculator, with the saved profile. Only runs when
// the user asks; the same request again is answered from the saved estimate.
export async function POST(req: NextRequest) {
  const { t } = await getT()
  try {
    const body = await req.json().catch(() => null)
    const year = Number(body?.year)
    if (!Number.isInteger(year) || year < FIRST_ESTV_YEAR || year > new Date().getFullYear()) {
      return NextResponse.json({ error: `year must be ${FIRST_ESTV_YEAR}–${new Date().getFullYear()}` }, { status: 400 })
    }
    const amounts = { income: body?.income ?? 0, partnerIncome: body?.partnerIncome ?? 0, wealth: body?.wealth }
    if (!Object.values(amounts).every(isAmount)) {
      return NextResponse.json({ error: "income, partnerIncome and wealth must be numbers ≥ 0" }, { status: 400 })
    }

    const profile = await loadTaxProfile()
    const request = taxRequest(profile, year, await ageAtYearEnd(year), amounts)
    if (!request) return NextResponse.json({ error: t("err.estv.noLocation") }, { status: 400 })

    const saved = await loadTaxEstimate(year)
    if (saved && sameRequest(saved.request, request)) return NextResponse.json({ estimate: saved })

    const estimate = { request, location: profile.location!, result: await calculateTax(request), at: new Date().toISOString() }
    await saveTaxEstimate(estimate)
    return NextResponse.json({ estimate })
  } catch (error) {
    console.error("Tax estimate error:", error)
    if (error instanceof EstvError) return NextResponse.json({ error: t(`err.estv.${error.reason}`) }, { status: 502 })
    return NextResponse.json({ error: t("err.estv.failed") }, { status: 500 })
  }
}
