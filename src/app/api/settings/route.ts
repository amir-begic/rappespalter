import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  BIRTH_DATE_KEY, DEFAULT_AGE, DEFAULT_SETTINGS, LEGACY_AGE_KEY, estimateBirthDate, isBirthDate, isSettingKey,
  type Settings,
} from "@/lib/settings"

// `birthDateEstimated`: no birth date saved (or configured), so it's guessed from
// the old "current age" setting — the Settings page asks for the real one.
async function loadSettings(): Promise<{ settings: Settings; birthDateEstimated: boolean }> {
  const rows = await prisma.setting.findMany()
  const settings = { ...DEFAULT_SETTINGS }
  let legacyAge: number | null = null
  for (const r of rows) {
    const n = Number(r.value)
    if (isSettingKey(r.key) && Number.isFinite(n)) settings[r.key] = n
    if (r.key === BIRTH_DATE_KEY && isBirthDate(r.value)) settings.birthDate = r.value
    if (r.key === LEGACY_AGE_KEY && Number.isFinite(n)) legacyAge = n
  }
  const birthDateEstimated = settings.birthDate == null
  if (birthDateEstimated) settings.birthDate = estimateBirthDate(legacyAge ?? DEFAULT_AGE)
  return { settings, birthDateEstimated }
}

export async function GET() {
  try {
    return NextResponse.json({ ...await loadSettings(), defaults: DEFAULT_SETTINGS })
  } catch (error) {
    console.error("Settings fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 })
  }
}

// Partial update: { settings: { birthDate: "1994-03-12", monthlyEtf: 1500 } }.
// A null value removes the override, reverting that key to its default.
export async function PUT(req: NextRequest) {
  try {
    const body  = await req.json()
    const input = body?.settings
    if (!input || typeof input !== "object") {
      return NextResponse.json({ error: "Body must be { settings: { key: value } }" }, { status: 400 })
    }

    const entries = Object.entries(input as Record<string, unknown>)
    for (const [key, value] of entries) {
      if (key === BIRTH_DATE_KEY) {
        if (value !== null && !(isBirthDate(value) && Date.parse(value) < Date.now())) {
          return NextResponse.json({ error: "birthDate must be a past date (YYYY-MM-DD) or null" }, { status: 400 })
        }
        continue
      }
      if (!isSettingKey(key)) {
        return NextResponse.json({ error: `Unknown setting "${key}"` }, { status: 400 })
      }
      if (value !== null && !(typeof value === "number" && Number.isFinite(value) && value >= 0)) {
        return NextResponse.json({ error: `"${key}" must be a number ≥ 0 or null` }, { status: 400 })
      }
    }
    // A saved birth date supersedes the old age setting.
    if (typeof input.birthDate === "string") entries.push([LEGACY_AGE_KEY, null])

    await prisma.$transaction(
      entries.map(([key, value]) =>
        value === null
          ? prisma.setting.deleteMany({ where: { key } })
          : prisma.setting.upsert({
              where:  { key },
              update: { value: String(value) },
              create: { key, value: String(value) },
            })
      )
    )

    return NextResponse.json({ ...await loadSettings(), defaults: DEFAULT_SETTINGS })
  } catch (error) {
    console.error("Settings save error:", error)
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 })
  }
}
