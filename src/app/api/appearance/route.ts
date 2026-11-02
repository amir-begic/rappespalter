import { NextRequest, NextResponse } from "next/server"
import { isMotion, isTheme, type Appearance } from "@/lib/appearance"
import { loadAppearance, saveAppearance } from "@/lib/appearance-store"

export async function GET() {
  return NextResponse.json({ appearance: await loadAppearance() })
}

// Partial update: { theme?: "light" | "dark", motion?: "system" | "reduce" | "full" }.
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const change: Partial<Appearance> = {}
    if (body?.theme !== undefined) {
      if (!isTheme(body.theme)) return NextResponse.json({ error: 'theme must be "light" or "dark"' }, { status: 400 })
      change.theme = body.theme
    }
    if (body?.motion !== undefined) {
      if (!isMotion(body.motion)) return NextResponse.json({ error: 'motion must be "system", "reduce" or "full"' }, { status: 400 })
      change.motion = body.motion
    }
    if (!Object.keys(change).length) {
      return NextResponse.json({ error: "Nothing to change: send theme and/or motion" }, { status: 400 })
    }
    return NextResponse.json({ appearance: await saveAppearance(change) })
  } catch (error) {
    console.error("Appearance save error:", error)
    return NextResponse.json({ error: "Failed to save appearance" }, { status: 500 })
  }
}
