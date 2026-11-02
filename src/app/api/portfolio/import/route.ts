import { NextRequest, NextResponse } from "next/server"
import { YuhFormatError, parseYuhCSV } from "@/lib/portfolio/yuh"
import { getT } from "@/lib/i18n/store"
import { importActivities } from "@/lib/portfolio/store"

// Import a Yuh "Activities" CSV. Market data is fetched separately via
// /api/portfolio/refresh so a slow or offline price source never blocks import.
export async function POST(req: NextRequest) {
  const { t } = await getT()
  try {
    const file = (await req.formData()).get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: t("err.noFile") }, { status: 400 })
    }
    if (!/\.csv$/i.test(file.name)) {
      return NextResponse.json({ error: t("err.notCsv") }, { status: 400 })
    }

    let parsed
    try {
      parsed = parseYuhCSV(Buffer.from(await file.arrayBuffer()))
    } catch (e) {
      return NextResponse.json({ error: e instanceof YuhFormatError ? t("err.yuhFormat", { count: e.missing.length, columns: e.missing.join(", ") }) : t("err.unreadable") }, { status: 400 })
    }
    if (parsed.activities.length === 0) {
      return NextResponse.json({ error: t("err.noActivities") }, { status: 400 })
    }

    const { imported, skipped } = await importActivities(parsed)
    return NextResponse.json({
      imported,
      skipped,
      rejected: parsed.skipped.rejected,
      unknown:  [...new Set(parsed.skipped.unknown)],
      total:    parsed.activities.length,
    })
  } catch (error) {
    console.error("Portfolio import error:", error)
    return NextResponse.json({ error: t("err.importFailed") }, { status: 500 })
  }
}
