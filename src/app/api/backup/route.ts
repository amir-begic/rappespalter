import { readFileSync, rmSync } from "node:fs"
import { NextRequest, NextResponse } from "next/server"
import { snapshot, tempPath } from "@/lib/backup"
import { BackupPasswordError, ENCRYPTED_EXTENSION, encryptBackup } from "@/lib/backup-crypto"
import { recordBackup } from "@/lib/backup-store"
import { getT } from "@/lib/i18n/store"

// A copy of the whole database as a file download. The page asks where to save it
// (Settings → Backup & restore; the desktop app shows its own Save dialog).
// POST { password? }: with a password the file is encrypted (lib/backup-crypto.ts).
// The password travels in the body, never in the URL.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const password = typeof body?.password === "string" && body.password !== "" ? body.password : null
  return download(password)
}

// The plain backup without a password, as before.
export async function GET() {
  return download(null)
}

async function download(password: string | null) {
  const { t } = await getT()
  const file = tempPath("backup")
  try {
    await snapshot(file)
    const data = password ? encryptBackup(readFileSync(file), password) : readFileSync(file)
    await recordBackup()
    const date = new Date().toISOString().slice(0, 10)
    const name = `rappespalter-backup-${date}${password ? ENCRYPTED_EXTENSION : ".db"}`
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": password ? "application/octet-stream" : "application/vnd.sqlite3",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    if (error instanceof BackupPasswordError) {
      return NextResponse.json({ error: t(`err.backup.${error.code}`), code: error.code }, { status: 400 })
    }
    console.error("Backup error:", error)
    return NextResponse.json({ error: t("err.backupFailed") }, { status: 500 })
  } finally {
    rmSync(file, { force: true })
  }
}
