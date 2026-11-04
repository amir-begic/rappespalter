import { NextRequest, NextResponse } from "next/server"
import { EstvError, searchLocations } from "@/lib/estv"
import { getT } from "@/lib/i18n/store"

// GET /api/tax/locations?q=Winterthur → { locations: TaxLocation[] }. Asks the ESTV
// calculator; only the typed place name or postcode is sent.
export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim()
  if (q.length < 2) return NextResponse.json({ locations: [] })
  try {
    return NextResponse.json({ locations: (await searchLocations(q.slice(0, 60))).slice(0, 30) })
  } catch (error) {
    console.error("Tax location search error:", error)
    const { t } = await getT()
    const reason = error instanceof EstvError ? error.reason : "unreachable"
    return NextResponse.json({ error: t(`err.estv.${reason}`) }, { status: 502 })
  }
}
