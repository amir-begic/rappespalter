import { rmSync, writeFileSync } from "node:fs"
import { NextRequest, NextResponse } from "next/server"
import { BackupError, restoreFrom, tempPath } from "@/lib/backup"
import { getT } from "@/lib/i18n/store"

// Restore: multipart upload with the backup file as "file". Replaces all data after
// saving a safety copy of the current database (lib/backup.ts).
export async function POST(req: NextRequest) {
  const { t } = await getT()
  const form = await req.formData().catch(() => null)
  const upload = form?.get("file")
  if (!(upload instanceof File) || upload.size === 0) {
    return NextResponse.json({ error: t("err.restoreChoose") }, { status: 400 })
  }

  const file = tempPath("restore")
  try {
    writeFileSync(file, Buffer.from(await upload.arrayBuffer()))
    const { safetyCopy } = await restoreFrom(file)
    return NextResponse.json({ restored: true, safetyCopy })
  } catch (error) {
    console.error("Restore error:", error)
    const message = error instanceof BackupError ? t(`err.backup.${error.code}`) : t("err.restoreFailed")
    return NextResponse.json({ error: message }, { status: 400 })
  } finally {
    rmSync(file, { force: true })
  }
}
