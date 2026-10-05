import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { DEFAULT_SETTINGS, isSettingKey, type Settings } from "@/lib/settings"
import { ensureSettingTable as ensureTable } from "@/lib/setting-table"


async function loadSettings(): Promise<Settings> {
  await ensureTable()
  const rows = await prisma.setting.findMany()
  const settings = { ...DEFAULT_SETTINGS }
  for (const r of rows) {
    const n = Number(r.value)
    if (isSettingKey(r.key) && Number.isFinite(n)) settings[r.key] = n
  }
  return settings
}

export async function GET() {
  try {
    return NextResponse.json({ settings: await loadSettings(), defaults: DEFAULT_SETTINGS })
  } catch (error) {
    console.error("Settings fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 })
  }
}

// Partial update: { settings: { startAge: 32, monthlyEtf: 1500 } }.
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
      if (!isSettingKey(key)) {
        return NextResponse.json({ error: `Unknown setting "${key}"` }, { status: 400 })
      }
      if (value !== null && !(typeof value === "number" && Number.isFinite(value) && value >= 0)) {
        return NextResponse.json({ error: `"${key}" must be a number ≥ 0 or null` }, { status: 400 })
      }
    }

    await ensureTable()
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

    return NextResponse.json({ settings: await loadSettings(), defaults: DEFAULT_SETTINGS })
  } catch (error) {
    console.error("Settings save error:", error)
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 })
  }
}
