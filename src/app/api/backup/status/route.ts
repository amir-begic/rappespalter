import { NextRequest, NextResponse } from "next/server"
import { backupInfo, snoozeBackupReminder } from "@/lib/backup-store"

// GET: the last backup, whether to remind, and the copies kept on this computer.
// POST { snooze: true }: "Later" on the reminder.
export async function GET() {
  try {
    return NextResponse.json(await backupInfo())
  } catch (error) {
    console.error("Backup status error:", error)
    return NextResponse.json({ error: "Failed to load the backup status" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (body?.snooze !== true) return NextResponse.json({ error: "Expected { snooze: true }" }, { status: 400 })
  await snoozeBackupReminder()
  return NextResponse.json(await backupInfo())
}
