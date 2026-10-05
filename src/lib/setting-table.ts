import { prisma } from "@/lib/prisma"

// The desktop app doesn't run migrations on an existing userData database, so
// create the Setting table on demand (mirrors migration 20260924120000_add_settings).
let tableReady: Promise<unknown> | null = null
export function ensureSettingTable() {
  tableReady ??= prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "Setting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL)`
  ).catch(err => { tableReady = null; throw err })
  return tableReady
}
