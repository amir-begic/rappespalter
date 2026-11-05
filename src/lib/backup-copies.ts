// Copies of the database kept on this computer, in backups/ next to it:
//   daily/           one a day while the app runs, the newest DAILY_KEEP kept
//   before-update/   made by the desktop app before it installs an update
//   before-restore/  made before a backup replaces the data
// They guard against a bad import or a bug, not a broken disk (same disk), so
// the app still reminds about real backups (backup-status.ts). Settings lists
// them and can restore any of them.
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, copyFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { createClient } from "@libsql/client"
import { databasePath, restoreFrom, snapshot, tempPath } from "@/lib/backup"
import { prisma } from "@/lib/prisma"

export const COPY_KINDS = ["daily", "before-update", "before-restore"] as const
export type CopyKind = (typeof COPY_KINDS)[number]
export const isCopyKind = (v: unknown): v is CopyKind => COPY_KINDS.includes(v as CopyKind)

export const DAILY_KEEP = 7
const CHECK_EVERY_MS = 60 * 60 * 1000
const COPY_NAME = /^rappespalter-[\w.-]+\.db$/

export interface LocalCopy {
  kind: CopyKind
  name: string
  date: string // ISO, when it was made
  size: number // bytes
}

export const backupsDir = () => join(dirname(databasePath()), "backups")

export function listCopies(): LocalCopy[] {
  const copies: LocalCopy[] = []
  for (const kind of COPY_KINDS) {
    const dir = join(backupsDir(), kind)
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir)) {
      if (!COPY_NAME.test(name)) continue
      const stat = statSync(join(dir, name))
      copies.push({ kind, name, date: stat.mtime.toISOString(), size: stat.size })
    }
  }
  return copies.sort((a, b) => b.date.localeCompare(a.date))
}

// Today's daily copy, unless there is one already or nothing to keep yet.
// Returns its path when it made one.
export async function makeDailyCopy(now = new Date()): Promise<string | null> {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  const dir = join(backupsDir(), "daily")
  const target = join(dir, `rappespalter-${day}.db`)
  if (existsSync(target)) return null

  const [transactions, snapshots] = await Promise.all([prisma.transaction.count(), prisma.snapshot.count()])
  if (!transactions && !snapshots) return null

  mkdirSync(dir, { recursive: true })
  await snapshot(target)
  const daily = readdirSync(dir).filter(f => COPY_NAME.test(f)).sort().reverse()
  for (const old of daily.slice(DAILY_KEEP)) rmSync(join(dir, old), { force: true })
  return target
}

let timer: ReturnType<typeof setInterval> | null = null

// At server start (src/instrumentation.ts): a copy now if today has none, then
// a check every hour, so an app left open overnight makes the next day's too.
export function startDailyCopies() {
  if (timer || !(process.env.DATABASE_URL ?? "").startsWith("file:")) return
  const run = () => makeDailyCopy()
    .then(made => { if (made) console.log(`[backup] daily copy ${made}`) })
    .catch(error => console.error("[backup] daily copy failed:", error))
  void run()
  timer = setInterval(run, CHECK_EVERY_MS)
  timer.unref?.()
}

// Restores one of the listed copies (kind + name, checked against the list).
export async function restoreCopy(kind: CopyKind, name: string) {
  const copy = listCopies().find(c => c.kind === kind && c.name === name)
  if (!copy) throw new Error(`No such copy: ${kind}/${name}`)
  const source = join(backupsDir(), kind, name)

  // A copy taken next to its WAL (before-update) is only complete with it:
  // open the pair and write one consistent file to restore from.
  const pair = tempPath("copy")
  const single = tempPath("copy-single")
  try {
    copyFileSync(source, pair)
    if (existsSync(source + "-wal")) copyFileSync(source + "-wal", pair + "-wal")
    const client = createClient({ url: `file:${pair}` })
    try {
      await client.execute(`VACUUM INTO '${single.replace(/'/g, "''")}'`)
    } finally {
      client.close()
    }
    return await restoreFrom(single)
  } finally {
    for (const f of [pair, pair + "-wal", pair + "-shm", single]) rmSync(f, { force: true })
  }
}
