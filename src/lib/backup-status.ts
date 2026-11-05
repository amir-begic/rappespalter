// When to remind about backups. Pure.
//
// Backups are only made when asked (they always ask where to go), so the app
// reminds: once there's data worth keeping, a month after the last backup, or
// a month after the first data if there's never been one. "Later" snoozes it.

export const REMIND_AFTER_DAYS = 30
export const SNOOZE_DAYS = 14

const DAY = 86_400_000

export const BACKUP_KEYS = {
  lastAt:      "backup.lastAt",      // ISO time of the last backup download
  remindAfter: "backup.remindAfter", // ISO time a snoozed reminder may return
} as const

// Days since the last backup (or since the first data, if none) when a reminder
// is due, else null.
export function backupDue(s: {
  lastBackupAt: Date | null
  firstDataAt:  Date | null
  snoozedUntil: Date | null
  now:          Date
}): number | null {
  const since = s.lastBackupAt ?? s.firstDataAt
  if (!since) return null // nothing to lose yet
  if (s.snoozedUntil && s.snoozedUntil > s.now) return null
  const days = Math.floor((s.now.getTime() - since.getTime()) / DAY)
  return days >= REMIND_AFTER_DAYS ? days : null
}

export const parseDate = (value: string | undefined | null) => {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}
