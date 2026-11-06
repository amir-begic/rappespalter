// The packaged desktop app, end to end: what unit tests can't reach. Electron
// starting the bundled server, the per-launch API token, migrations at startup,
// the loading page and backups. Each test runs on a throwaway data folder
// (RAPPESPALTER_USER_DATA, read by electron/main.js). Fictional data only.
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test"
import { createClient } from "@libsql/client"
import { migrate, readMigrations, statements } from "../src/lib/migrate"

const root = resolve(__dirname, "..")
const APP_URL = /^http:\/\/127\.0\.0\.1:\d+\//

// The unpacked app electron-builder leaves in dist/, or E2E_APP.
function appPath() {
  if (process.env.E2E_APP) return process.env.E2E_APP
  const candidates = {
    linux:  ["dist/linux-unpacked/rappespalter"],
    win32:  ["dist/win-unpacked/Rappespalter.exe"],
    darwin: ["dist/mac-arm64/Rappespalter.app/Contents/MacOS/Rappespalter", "dist/mac/Rappespalter.app/Contents/MacOS/Rappespalter"],
  }[process.platform as "linux" | "win32" | "darwin"] ?? []
  const found = candidates.map(c => join(root, c)).find(existsSync)
  if (!found) throw new Error(`No packaged app in dist/ (looked for ${candidates.join(", ")}); build it or set E2E_APP`)
  return found
}

const folders: string[] = []
function dataFolder() {
  const dir = mkdtempSync(join(tmpdir(), "rappespalter-e2e-"))
  folders.push(dir)
  return dir
}
// On Windows the app's server may hold the database open for a moment after the
// app has quit (it's killed, not waited for), so deleting retries. A folder that
// still won't go is left in the temp dir rather than failing a test that passed.
test.afterAll(() => {
  for (const dir of folders) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
    } catch (error) {
      console.warn(`Could not remove ${dir}:`, error)
    }
  }
})

async function launch(userData: string) {
  const env: Record<string, string> = { ...(process.env as Record<string, string>), RAPPESPALTER_USER_DATA: userData }
  delete env.ELECTRON_RUN_AS_NODE // set inside VS Code's terminal; Electron would act as plain Node
  return electron.launch({
    executablePath: appPath(),
    args: process.platform === "linux" ? ["--no-sandbox"] : [],
    env,
    timeout: 60_000,
  })
}

// The window once it shows the app (after the loading page), and every response
// the app's own pages got from its server.
async function openApp(app: ElectronApplication) {
  const page = await app.firstWindow()
  const responses: { url: string; status: number }[] = []
  page.on("response", r => responses.push({ url: r.url(), status: r.status() }))
  await page.waitForURL(APP_URL, { timeout: 120_000 })
  await page.waitForLoadState("domcontentloaded")
  return { page, responses, origin: new URL(page.url()).origin }
}

const fetchStatus = (page: Page, path: string) =>
  page.evaluate(async p => (await fetch(p)).status, path)

test("a new install starts on the welcome page, after the loading animation", async () => {
  const userData = dataFolder()
  const app = await launch(userData)
  try {
    const first = await app.firstWindow()
    let shownAt = 0
    if (first.url().startsWith("file:")) {
      shownAt = Date.now()
      const reduced = await first.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)
      if (reduced) shownAt = 0
    }
    const { page, responses, origin } = await openApp(app)
    // The name is written out (~2.8 s) before the app replaces the loading page.
    if (shownAt) expect(Date.now() - shownAt).toBeGreaterThanOrEqual(2500)

    await expect(page).toHaveURL(/\/welcome/)
    expect(await fetchStatus(page, "/api/months")).toBe(200)

    // Only the app's own window may use the server (src/proxy.ts).
    expect((await fetch(`${origin}/api/months`)).status).toBe(403)
    expect((await fetch(`${origin}/api/backup`, { method: "POST" })).status).toBe(403)

    // Settings renders, with the backup card.
    await page.goto(`${origin}/settings`)
    await expect(page.locator("#backup")).toBeVisible({ timeout: 30_000 })

    // A backup, plain and with a password, through the window's own fetch.
    const backups = await page.evaluate(async () => {
      const head = async (body: object) => {
        const res = await fetch("/api/backup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const bytes = new Uint8Array(await res.arrayBuffer())
        return [res.status, String.fromCharCode(...bytes.slice(0, 15))] as const
      }
      return [await head({}), await head({ password: "correct horse" })]
    })
    expect(backups[0]).toEqual([200, "SQLite format 3"])
    expect(backups[1][0]).toBe(200)
    expect(backups[1][1].startsWith("RPBACKUP")).toBe(true)

    const refused = responses.filter(r => r.url.startsWith(origin) && r.status === 403)
    expect(refused).toEqual([])
  } finally {
    await app.close()
  }
})

test("an older database is brought up to date and keeps its data", async () => {
  const userData = dataFolder()
  const url = `file:${join(userData, "rappespalter.db")}`
  const all = readMigrations(join(root, "prisma", "migrations"))

  // As an early release left it: two migrations recorded, a table made on demand
  // by a helper (unrecorded), one transaction with a mark.
  await migrate(url, all.slice(0, 2))
  const db = createClient({ url })
  for (const sql of statements(all.find(m => m.name.endsWith("_transaction_marks"))!.sql)) await db.execute(sql)
  await db.executeMultiple(`
    INSERT INTO "Category" ("name", "type") VALUES ('Groceries', 'variable');
    INSERT INTO "Transaction" ("date", "counterparty", "amount", "account", "categoryId", "sourceHash")
      VALUES (1767225600000, 'Example Shop', -42, 'CH00 0000 0000 0000 0000 0', 1, 'e2e-1');
    INSERT INTO "TransactionMark" ("transactionId", "oneOff") VALUES (1, 1);
  `)
  db.close()

  const app = await launch(userData)
  try {
    const { page } = await openApp(app)
    await expect(page).toHaveURL(/\/dashboard/) // has data, so no first-start setup
    const tx = await page.evaluate(async () => (await fetch("/api/transactions?limit=5")).json())
    expect(tx.pagination.total).toBe(1)
    expect(tx.transactions[0].mark.oneOff).toBe(true)
    expect(await fetchStatus(page, "/api/imports")).toBe(200) // a table from the newest migration
  } finally {
    await app.close()
  }

  const after = createClient({ url })
  try {
    const recorded = await after.execute(`SELECT migration_name FROM _prisma_migrations ORDER BY 1`)
    expect(recorded.rows.map(r => String(r.migration_name))).toEqual(all.map(m => m.name))
  } finally {
    after.close()
  }
  // There's data, so the server made today's copy.
  expect(readdirSync(join(userData, "backups", "daily")).length).toBe(1)
})
