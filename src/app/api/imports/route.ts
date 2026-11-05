import { NextRequest, NextResponse } from "next/server"
import { listImports, undoImport } from "@/lib/imports"
import { getT } from "@/lib/i18n/store"

// GET: recent bank imports that still have rows (or re-filed some).
// DELETE ?id=: undo one (lib/imports.ts).
export async function GET() {
  try {
    return NextResponse.json({ imports: await listImports() })
  } catch (error) {
    console.error("Imports error:", error)
    return NextResponse.json({ error: (await getT()).t("err.importsLoad") }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"))
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Expected ?id=" }, { status: 400 })
  try {
    const result = await undoImport(id)
    if (!result) return NextResponse.json({ error: "No such import" }, { status: 404 })
    return NextResponse.json({ undone: true, ...result })
  } catch (error) {
    console.error("Undo import error:", error)
    return NextResponse.json({ error: (await getT()).t("err.importUndo") }, { status: 500 })
  }
}
