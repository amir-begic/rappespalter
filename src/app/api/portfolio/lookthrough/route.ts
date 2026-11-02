import { NextRequest, NextResponse } from "next/server"
import { parseConstituentFile, providerLabel } from "@/lib/portfolio/constituents"
import { deleteConstituents, importConstituents, loadLookThrough } from "@/lib/portfolio/store"

// Look-through of ETFs into the companies they hold (docs/PORTFOLIO-LOOKTHROUGH.md).
export async function GET() {
  try {
    return NextResponse.json(await loadLookThrough())
  } catch (error) {
    console.error("Look-through error:", error)
    return NextResponse.json({ error: "Failed to load look-through" }, { status: 500 })
  }
}

// Upload a fund's constituent file: multipart `file` + `symbol` (the ETF it
// belongs to). Replaces that fund's previous constituents.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get("file") as File | null
    const symbol = String(form.get("symbol") ?? "")
    if (!file || !symbol) {
      return NextResponse.json({ error: "Provide a file and the ETF it belongs to" }, { status: 400 })
    }

    let parsed
    try {
      parsed = parseConstituentFile(Buffer.from(await file.arrayBuffer()), file.name)
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read file" }, { status: 400 })
    }

    try {
      await importConstituents(symbol, parsed, file.name)
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Unknown security")) {
        return NextResponse.json({ error: e.message }, { status: 404 })
      }
      throw e
    }
    return NextResponse.json({
      provider: providerLabel(parsed.provider),
      asOf:     parsed.asOf,
      fundName: parsed.fundName,
      rows:     parsed.rows.length,
      auto:     parsed.provider === "xtrackers" && parsed.fundIsin != null,
    })
  } catch (error) {
    console.error("Constituent import error:", error)
    return NextResponse.json({ error: "Failed to import file" }, { status: 500 })
  }
}

// Forget a fund's constituents: DELETE ?symbol=VWRL
export async function DELETE(req: NextRequest) {
  try {
    const symbol = new URL(req.url).searchParams.get("symbol")
    if (!symbol) return NextResponse.json({ error: "symbol is required" }, { status: 400 })
    await deleteConstituents(symbol)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Constituent delete error:", error)
    return NextResponse.json({ error: "Failed to delete constituents" }, { status: 500 })
  }
}
