import { readFileSync, rmSync } from "node:fs"
import { NextResponse } from "next/server"
import { snapshot, tempPath } from "@/lib/backup"

// A copy of the whole database as a file download. The page asks where to save it
// (Settings → Backup & restore; the desktop app shows its own Save dialog).
export async function GET() {
  const file = tempPath("backup")
  try {
    await snapshot(file)
    const date = new Date().toISOString().slice(0, 10)
    return new NextResponse(readFileSync(file), {
      headers: {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Disposition": `attachment; filename="rappespalter-backup-${date}.db"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("Backup error:", error)
    return NextResponse.json({ error: "Failed to create the backup" }, { status: 500 })
  } finally {
    rmSync(file, { force: true })
  }
}
