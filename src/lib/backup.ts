// Backup and restore of the whole SQLite database (Settings → Backup & restore).
//
// A backup is a consistent copy made with VACUUM INTO while the app keeps running.
// A restore checks the file, saves a safety copy of the current data to
// backups/before-restore/ next to the database (the newest few are kept, like
// backups/before-update/ in the desktop app), closes Prisma's connection, swaps the
// file in and lets the next query reconnect.
import { closeSync, copyFileSync, mkdirSync, openSync, readdirSync, readSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { randomUUID } from "node:crypto"
import { createClient } from "@libsql/client"
import { prisma } from "@/lib/prisma"
import { resetSettingTable } from "@/lib/setting-table"
import { resetRuleTable } from "@/lib/rules-store"
import { resetPortfolioSchema } from "@/lib/portfolio/schema"
import { resetMarkTable } from "@/lib/marks"

const BEFORE_RESTORE_KEEP = 5
// Tables every Rappespalter database has; the on-demand ones are created later.
const REQUIRED_TABLES = ["Transaction", "Category"]

export function databasePath() {
  const url = process.env.DATABASE_URL ?? ""
  if (!url.startsWith("file:")) throw new Error("Backups need a local SQLite database (DATABASE_URL=file:…)")
  return resolve(url.slice("file:".length))
}

export const tempPath = (label: string) => join(tmpdir(), `rappespalter-${label}-${randomUUID()}.db`)

const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`

// A consistent copy of the live database at `target` (which must not exist yet).
export async function snapshot(target: string) {
  await prisma.$executeRawUnsafe(`VACUUM INTO ${sqlString(target)}`)
}

// Throws a readable error unless `file` is an intact Rappespalter database.
export async function checkBackup(file: string) {
  const header = Buffer.alloc(16)
  const fd = openSync(file, "r")
  try {
    readSync(fd, header, 0, 16, 0)
  } finally {
    closeSync(fd)
  }
  if (!header.toString("latin1").startsWith("SQLite format 3")) {
    throw new Error("This isn't a database file. Choose a backup made with “Back up…”.")
  }

  const client = createClient({ url: `file:${file}` })
  try {
    const check = await client.execute("PRAGMA quick_check")
    if (check.rows[0]?.[0] !== "ok") throw new Error("This backup is damaged and can't be restored.")
    const tables = await client.execute(`SELECT name FROM sqlite_master WHERE type = 'table'`)
    const names = new Set(tables.rows.map(r => String(r[0])))
    const missing = REQUIRED_TABLES.filter(t => !names.has(t))
    if (missing.length) throw new Error("This database isn't a Rappespalter backup.")
  } finally {
    client.close()
  }
}

// Replaces the live database with `file`. Returns where the previous data was saved.
export async function restoreFrom(file: string) {
  await checkBackup(file)
  const db = databasePath()

  const dir = join(dirname(db), "backups", "before-restore")
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const safetyCopy = join(dir, `rappespalter-${stamp}.db`)
  await snapshot(safetyCopy)
  const copies = readdirSync(dir).filter(f => f.endsWith(".db")).sort().reverse()
  for (const old of copies.slice(BEFORE_RESTORE_KEEP)) rmSync(join(dir, old), { force: true })

  await prisma.$disconnect()
  try {
    swapIn(file, db)
    await prisma.$queryRawUnsafe("SELECT 1")
  } catch (error) {
    // Put the previous data back rather than leave a half-restored database.
    await prisma.$disconnect().catch(() => {})
    swapIn(safetyCopy, db)
    throw error
  }
  return { safetyCopy }
}

function swapIn(source: string, db: string) {
  copyFileSync(source, db)
  for (const ext of ["-wal", "-shm", "-journal"]) rmSync(db + ext, { force: true })
  // The restored file may predate the tables these create on demand.
  resetSettingTable()
  resetRuleTable()
  resetPortfolioSchema()
  resetMarkTable()
}
