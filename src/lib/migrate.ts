// Brings a database up to the current schema by applying the SQL files in
// prisma/migrations that it hasn't recorded yet. Runs when the server starts
// (src/instrumentation.ts) and on a backup before it's restored, so the desktop
// app's userData database, an old backup and a dev database all catch up the
// same way, without the Prisma CLI (which the standalone bundle doesn't ship).
//
// Applied migrations are recorded in Prisma's own `_prisma_migrations` table, in
// Prisma's format (checksum = SHA-256 of migration.sql), so `prisma migrate dev`
// and `migrate deploy` see the same history.
import { createHash, randomUUID } from "node:crypto"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createClient, type Client, type Transaction } from "@libsql/client"

// Until 2026-11 the app created tables on demand instead of migrating, so an
// older database can already hold what these migrations create without having
// recorded them. For these only, "already exists" means exactly that: the
// statement is skipped and the migration recorded. Every later migration must
// apply cleanly.
const LAST_ON_DEMAND_MIGRATION = "20261104100000_assets_liabilities"
const ALREADY_THERE = /already exists|duplicate column name/i

export interface Migration {
  name: string
  sql:  string
}

export function migrationsDir() {
  return join(process.cwd(), "prisma", "migrations")
}

export function readMigrations(dir = migrationsDir()): Migration[] {
  if (!existsSync(dir)) throw new Error(`Migrations not found at ${dir}`)
  return readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(join(dir, d.name, "migration.sql")))
    .map(d => ({ name: d.name, sql: readFileSync(join(dir, d.name, "migration.sql"), "utf8") }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

const checksum = (sql: string) => createHash("sha256").update(sql).digest("hex")

// One statement per entry, without comment lines. Prisma's SQL has no
// semicolons inside strings, so splitting at line-ending semicolons is safe.
export function statements(sql: string): string[] {
  return sql
    .split(/;[ \t]*(?:\r?\n|$)/)
    .map(s => s.split(/\r?\n/).filter(line => !line.trim().startsWith("--")).join("\n").trim())
    .filter(Boolean)
}

async function ensureHistoryTable(client: Client) {
  await client.execute(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
  )`)
}

async function isApplied(db: Client | Transaction, name: string) {
  const rows = await db.execute({
    sql: `SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = ? AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`,
    args: [name],
  })
  return rows.rows.length > 0
}

async function apply(client: Client, m: Migration) {
  // Prisma's table rebuilds (copy, DROP, rename) must not cascade deletes into
  // child tables. The pragma is ignored inside a transaction, so set it first,
  // on the connection the transaction then uses.
  await client.execute("PRAGMA foreign_keys = OFF")
  const tx = await client.transaction("write")
  try {
    if (await isApplied(tx, m.name)) return false // another server got there first
    const startedAt = Date.now()
    if (m.name <= LAST_ON_DEMAND_MIGRATION) {
      for (const sql of statements(m.sql)) {
        try {
          await tx.execute(sql)
        } catch (error) {
          if (!ALREADY_THERE.test(String((error as Error)?.message))) throw error
        }
      }
    } else {
      await tx.executeMultiple(m.sql)
    }
    await tx.execute({
      sql: `INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
            VALUES (?, ?, ?, ?, ?, 1)`,
      args: [randomUUID(), checksum(m.sql), Date.now(), m.name, startedAt],
    })
    await tx.commit()
    return true
  } catch (error) {
    throw new Error(`Migration ${m.name} failed: ${(error as Error)?.message ?? error}`, { cause: error })
  } finally {
    tx.close() // rolls back unless committed
  }
}

// Applies what's missing to the database at `url`; returns the names applied.
// On failure the failing migration is rolled back and the error thrown.
export async function migrate(url: string, migrations = readMigrations()): Promise<string[]> {
  const client = createClient({ url })
  try {
    await ensureHistoryTable(client)
    const applied: string[] = []
    for (const m of migrations) {
      if (await isApplied(client, m.name)) continue
      if (await apply(client, m)) applied.push(m.name)
    }
    if (applied.length) {
      const fk = await client.execute("PRAGMA foreign_key_check")
      if (fk.rows.length) console.warn(`[migrate] ${fk.rows.length} rows break a foreign key after migrating`)
    }
    return applied
  } finally {
    client.close()
  }
}

// The app's own database (DATABASE_URL).
export async function migrateDatabase() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set")
  const applied = await migrate(url)
  for (const name of applied) console.log(`[migrate] applied ${name}`)
  return applied
}

// At server start. A failed migration was rolled back, so the database is as it
// was; stop rather than serve every page with an error. The desktop app shows
// this output in a dialog (electron/main.js).
export async function migrateOnStartup() {
  try {
    await migrateDatabase()
  } catch (error) {
    console.error("[migrate] The database couldn't be updated to this version and was left unchanged.")
    console.error(error)
    process.exit(1)
  }
}
