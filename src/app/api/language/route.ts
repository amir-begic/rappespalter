import { NextRequest, NextResponse } from "next/server"
import { LOCALES, isLocale } from "@/lib/i18n/locales"
import { loadLocale, saveLocale } from "@/lib/i18n/store"

// GET: the language in use, and whether it was chosen (else it follows the system).
export async function GET() {
  const { locale, saved } = await loadLocale()
  return NextResponse.json({ language: locale, saved, available: LOCALES })
}

// PUT { language: "de-CH" | "fr-CH" | "it-CH" | "en-CH" }
export async function PUT(req: NextRequest) {
  try {
    const { language } = await req.json().catch(() => ({}))
    if (!isLocale(language)) {
      return NextResponse.json({ error: `language must be one of ${LOCALES.join(", ")}` }, { status: 400 })
    }
    await saveLocale(language)
    return NextResponse.json({ language, saved: true })
  } catch (error) {
    console.error("Language save error:", error)
    return NextResponse.json({ error: "Failed to save the language" }, { status: 500 })
  }
}
