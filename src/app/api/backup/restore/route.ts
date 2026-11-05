import { rmSync, writeFileSync } from "node:fs"
import { NextRequest, NextResponse } from "next/server"
import { BackupError, restoreFrom, tempPath } from "@/lib/backup"
import { isCopyKind, restoreCopy } from "@/lib/backup-copies"
import { BackupPasswordError, decryptBackup } from "@/lib/backup-crypto"
import { getT } from "@/lib/i18n/store"

// Restore. Replaces all data after saving a safety copy of the current database
// (lib/backup.ts). Either
//   multipart: "file" (a backup, .db or password-protected) and "password" if it has one
//   JSON { kind, name }: one of the copies kept on this computer (lib/backup-copies.ts)
export async function POST(req: NextRequest) {
  const { t } = await getT()
  const fail = (error: unknown) => {
    if (error instanceof BackupPasswordError) {
      return NextResponse.json({ error: t(`err.backup.${error.code}`), code: error.code }, { status: 400 })
    }
    console.error("Restore error:", error)
    const message = error instanceof BackupError ? t(`err.backup.${error.code}`) : t("err.restoreFailed")
    return NextResponse.json({ error: message }, { status: 400 })
  }

  if (req.headers.get("content-type")?.includes("application/json")) {
    const body = await req.json().catch(() => null)
    if (!isCopyKind(body?.kind) || typeof body?.name !== "string") {
      return NextResponse.json({ error: "Expected { kind, name }" }, { status: 400 })
    }
    try {
      const { safetyCopy } = await restoreCopy(body.kind, body.name)
      return NextResponse.json({ restored: true, safetyCopy })
    } catch (error) {
      return fail(error)
    }
  }

  const form = await req.formData().catch(() => null)
  const upload = form?.get("file")
  const password = form?.get("password")
  if (!(upload instanceof File) || upload.size === 0) {
    return NextResponse.json({ error: t("err.restoreChoose") }, { status: 400 })
  }

  const file = tempPath("restore")
  try {
    const data = decryptBackup(Buffer.from(await upload.arrayBuffer()), typeof password === "string" ? password : null)
    writeFileSync(file, data)
    const { safetyCopy } = await restoreFrom(file)
    return NextResponse.json({ restored: true, safetyCopy })
  } catch (error) {
    return fail(error)
  } finally {
    rmSync(file, { force: true })
  }
}
