import { prisma } from "@/lib/prisma"
import { HOME_DEFAULTS, isGoalKind, type Allocation, type Goal, type HomeParams } from "@/lib/goals"

export async function loadGoals(): Promise<Goal[]> {
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
