import { prisma } from "@/lib/prisma"
import { HOME_DEFAULTS, isGoalKind, type Allocation, type Goal, type HomeParams } from "@/lib/goals"

// The desktop app doesn't migrate existing userData databases, so create the
// goal tables on demand (mirrors 20261103090000_goals/migration.sql).
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "Goal" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "target" REAL NOT NULL DEFAULT 0,
    "targetDate" TEXT,
    "params" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "GoalAllocation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "goalId" INTEGER NOT NULL,
    "asset" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'percent',
    "value" REAL NOT NULL,
    CONSTRAINT "GoalAllocation_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "GoalAllocation_goalId_idx" ON "GoalAllocation"("goalId")`,
]

let tablesReady: Promise<unknown> | null = null
export function ensureGoalTables() {
  tablesReady ??= (async () => {
    for (const sql of STATEMENTS) await prisma.$executeRawUnsafe(sql)
  })().catch(err => { tablesReady = null; throw err })
  return tablesReady
}

// After the database file is swapped (restore), check again on next use.
export function resetGoalTables() {
  tablesReady = null
}

export async function loadGoals(): Promise<Goal[]> {
  await ensureGoalTables()
  const rows = await prisma.goal.findMany({
    include: { allocations: { orderBy: { id: "asc" } } },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  })
  return rows.map(g => ({
    id:          g.id,
    name:        g.name,
    kind:        isGoalKind(g.kind) ? g.kind : "other",
    target:      g.target,
    targetDate:  g.targetDate,
    params:      parseParams(g.params),
    allocations: g.allocations.map(a => ({ asset: a.asset, mode: a.mode, value: a.value }) as Allocation),
  }))
}

function parseParams(raw: string | null): HomeParams | null {
  if (!raw) return null
  try {
    return { ...HOME_DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return null
  }
}
