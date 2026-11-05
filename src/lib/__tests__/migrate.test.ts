import { createHash, randomUUID } from "node:crypto"
import { copyFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { migrate, readMigrations, statements, type Migration } from "../migrate"

const dir = mkdtempSync(join(tmpdir(), "rappespalter-migrate-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const newDb = () => `file:${join(dir, `${randomUUID()}.db`)}`
const ALL = readMigrations()
const byName = (name: string) => ALL.find(m => m.name.endsWith(name))!

async function query(url: string, sql: string) {
  const c = createClient({ url })
  try {
    return (await c.execute(sql)).rows
  } finally {
    c.close()
  }
}
const tables = async (url: string) =>
  new Set((await query(url, `SELECT name FROM sqlite_master WHERE type = 'table'`)).map(r => String(r.name)))
const columns = async (url: string, table: string) =>
  new Set((await query(url, `PRAGMA table_info("${table}")`)).map(r => String(r.name)))
const history = async (url: string) =>
  (await query(url, `SELECT migration_name, checksum FROM _prisma_migrations ORDER BY migration_name`))
    .map(r => ({ name: String(r.migration_name), checksum: String(r.checksum) }))

// A database as an older release left it: some migrations applied and recorded,
// others' tables made by the on-demand helpers without a record.
async function oldInstall(recorded: Migration[], unrecordedSql: string[]) {
  const url = newDb()
  await migrate(url, recorded)
  const c = createClient({ url })
  try {
    for (const sql of unrecordedSql) await c.execute(sql)
  } finally {
    c.close()
  }
  return url
}

describe("statements", () => {
  it("splits Prisma SQL into statements without comments", () => {
    expect(statements(`-- CreateTable\nCREATE TABLE "A" (\n  "x" TEXT\n);\n\n-- CreateIndex\nCREATE INDEX "i" ON "A"("x");\n`))
      .toEqual([`CREATE TABLE "A" (\n  "x" TEXT\n)`, `CREATE INDEX "i" ON "A"("x")`])
  })
})

describe("migrate", () => {
  it("builds a fresh database and records every migration the way Prisma does", async () => {
    const url = newDb()
    expect(await migrate(url)).toEqual(ALL.map(m => m.name))
    const t = await tables(url)
    for (const name of ["Transaction", "Category", "Setting", "Security", "CategoryRule", "TransactionMark", "Goal", "Asset", "Liability"]) {
      expect(t.has(name)).toBe(true)
    }
    expect(await history(url)).toEqual(ALL.map(m => ({
      name: m.name, checksum: createHash("sha256").update(m.sql).digest("hex"),
    })))
  })

  it("does nothing the second time", async () => {
    const url = newDb()
    await migrate(url)
    expect(await migrate(url)).toEqual([])
  })

  it("leaves the shipped template as it is", async () => {
    const file = join(dir, "template.db")
    copyFileSync("resources/template.db", file)
    expect(await migrate(`file:${file}`)).toEqual([])
  })

  it("adopts tables an older release created on demand, keeping their data", async () => {
    const init = byName("_init"), settings = byName("_add_settings"), marks = byName("_transaction_marks")
    // The template had init + settings; the helper then made TransactionMark.
    const url = await oldInstall([init, settings], [
      ...statements(marks.sql),
      `INSERT INTO "Category" ("name") VALUES ('Groceries')`,
      `INSERT INTO "Transaction" ("date", "counterparty", "amount", "account", "categoryId", "sourceHash")
        VALUES (0, 'Shop', -10, 'A', 1, 'h1')`,
      `INSERT INTO "TransactionMark" ("transactionId", "oneOff") VALUES (1, true)`,
    ])

    const applied = await migrate(url)
    expect(applied).toContain(marks.name)
    expect((await history(url)).map(h => h.name)).toEqual(ALL.map(m => m.name))
    expect(await query(url, `SELECT "oneOff" FROM "TransactionMark"`)).toHaveLength(1)
    expect((await tables(url)).has("Goal")).toBe(true)
  })

  it("adds columns that tables created on demand were missing", async () => {
    const before = ALL.filter(m => m.name < byName("_rules_targets_fees").name)
    // The portfolio helper made Security without ter / targetWeight, unrecorded.
    const url = await oldInstall(before.filter(m => !m.name.endsWith("_add_portfolio")), [
      ...statements(byName("_add_portfolio").sql),
    ])
    await migrate(url)
    const cols = await columns(url, "Security")
    expect(cols.has("ter")).toBe(true)
    expect(cols.has("targetWeight")).toBe(true)
  })

  it("rolls a failing new migration back and doesn't record it", async () => {
    const url = newDb()
    await migrate(url)
    const broken: Migration = {
      name: "20990101000000_broken",
      sql: `CREATE TABLE "Half" ("x" TEXT);\nINSERT INTO "Nope" VALUES (1);\n`,
    }
    await expect(migrate(url, [...ALL, broken])).rejects.toThrow(/20990101000000_broken/)
    expect((await tables(url)).has("Half")).toBe(false)
    expect((await history(url)).map(h => h.name)).not.toContain(broken.name)
  })

  it("rebuilds a table the way Prisma does without deleting rows that point at it", async () => {
    const url = newDb()
    await migrate(url)
    await query(url, `INSERT INTO "Transaction" ("date", "counterparty", "amount", "account", "sourceHash") VALUES (0, 'Shop', -10, 'A', 'h1')`)
    await query(url, `INSERT INTO "TransactionMark" ("transactionId", "oneOff") VALUES (1, true)`)

    // What `prisma migrate dev` writes for SQLite when a column changes.
    const redefine: Migration = {
      name: "20990101000000_redefine_transaction",
      sql: `-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Transaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "counterparty" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CHF',
    "account" TEXT NOT NULL,
    "categoryId" INTEGER,
    "bookingText" TEXT,
    "sourceHash" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("id", "date", "counterparty", "amount", "currency", "account", "categoryId", "bookingText", "sourceHash", "importedAt")
  SELECT "id", "date", "counterparty", "amount", "currency", "account", "categoryId", "bookingText", "sourceHash", "importedAt" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE UNIQUE INDEX "Transaction_sourceHash_key" ON "Transaction"("sourceHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
`,
    }
    expect(await migrate(url, [...ALL, redefine])).toEqual([redefine.name])
    expect((await columns(url, "Transaction")).has("note")).toBe(true)
    expect(await query(url, `SELECT * FROM "Transaction"`)).toHaveLength(1)
    expect(await query(url, `SELECT * FROM "TransactionMark"`)).toHaveLength(1)
  })
})
