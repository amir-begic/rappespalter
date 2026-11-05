// Backup bookkeeping in the Setting table: when the last backup was made and
// whether to remind (rules in backup-status.ts).
import { prisma } from "@/lib/prisma"
import { listCopies } from "@/lib/backup-copies"
import { BACKUP_KEYS, SNOOZE_DAYS, backupDue, parseDate } from "@/lib/backup-status"

const setSetting = (key: string, value: string) =>
  prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } })

export const recordBackup = (now = new Date()) => setSetting(BACKUP_KEYS.lastAt, now.toISOString())

export const snoozeBackupReminder = (now = new Date()) =>
  setSetting(BACKUP_KEYS.remindAfter, new Date(now.getTime() + SNOOZE_DAYS * 86_400_000).toISOString())

export async function backupInfo(now = new Date()) {
  const [rows, firstTransaction, firstSnapshot] = await Promise.all([
    prisma.setting.findMany({ where: { key: { in: Object.values(BACKUP_KEYS) } } }),
    prisma.transaction.findFirst({ orderBy: { importedAt: "asc" }, select: { importedAt: true } }),
    prisma.snapshot.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ])
  const get = (key: string) => rows.find(r => r.key === key)?.value
  const lastBackupAt = parseDate(get(BACKUP_KEYS.lastAt))
  const firstDataAt = [firstTransaction?.importedAt, firstSnapshot?.createdAt]
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null
  let copies: ReturnType<typeof listCopies> = []
  try {
    copies = listCopies()
  } catch {
    // not a local database (no backups folder to list)
  }
  return {
    lastBackupAt: lastBackupAt?.toISOString() ?? null,
    dueDays: backupDue({ lastBackupAt, firstDataAt, snoozedUntil: parseDate(get(BACKUP_KEYS.remindAfter)), now }),
    copies,
  }
}
