import { rmSync, writeFileSync } from "node:fs"
import { NextRequest, NextResponse } from "next/server"
import { restoreFrom, tempPath } from "@/lib/backup"

// Restore: multipart upload with the backup file as "file". Replaces all data after
// saving a safety copy of the current database (lib/backup.ts).
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const upload = form?.get("file")
  if (!(upload instanceof File) || upload.size === 0) {
    return NextResponse.json({ error: "Choose a backup file to restore" }, { status: 400 })
  }

  const file = tempPath("restore")
  try {
    writeFileSync(file, Buffer.from(await upload.arrayBuffer()))
    const { safetyCopy } = await restoreFrom(file)
    return NextResponse.json({ restored: true, safetyCopy })
  } catch (error) {
    console.error("Restore error:", error)
    const message = error instanceof Error ? error.message : "Failed to restore the backup"
    return NextResponse.json({ error: message }, { status: 400 })
  } finally {
    rmSync(file, { force: true })
  }
}
