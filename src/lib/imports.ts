// Bank imports as batches (Data → Import → Recent imports), so one can be undone.
// Undoing deletes the rows the import added (with their marks) and puts back the
// category of rows it re-filed as transfers, unless they were changed since.
// Imports from before batches were recorded have no batch; their rows can only be
// deleted one by one (Data → Transactions).
import { prisma } from "@/lib/prisma"

const RECENT = 20

interface Change { id: number; categoryId: number | null; categorySource: string | null }

const parseChanges = (raw: string | null): Change[] => {
  if (!raw) return []
  try {
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list.filter(c => Number.isInteger(c?.id)) : []
  } catch {
    return []
  }
}

export async function listImports() {
  const batches = await prisma.importBatch.findMany({ orderBy: { importedAt: "desc" }, take: RECENT })
  const counts = await prisma.transaction.groupBy({
    by: ["importId"],
    where: { importId: { in: batches.map(b => b.id) } },
    _count: { _all: true },
  })
  const remaining = new Map(counts.map(c => [c.importId, c._count._all]))
  return batches
    .map(b => ({
      id:         b.id,
      fileName:   b.fileName,
      format:     b.format,
      importedAt: b.importedAt.toISOString(),
      imported:   b.count,
      remaining:  remaining.get(b.id) ?? 0,
      refiled:    parseChanges(b.changes).length,
    }))
    .filter(b => b.remaining > 0 || b.refiled > 0)
}

export async function undoImport(id: number) {
  const batch = await prisma.importBatch.findUnique({ where: { id } })
  if (!batch) return null
  const changes = parseChanges(batch.changes)

  return prisma.$transaction(async tx => {
    const rows = await tx.transaction.findMany({ where: { importId: id }, select: { id: true } })
    const ids = rows.map(r => r.id)
    await tx.transactionMark.deleteMany({ where: { transactionId: { in: ids } } })
    await tx.transaction.deleteMany({ where: { id: { in: ids } } })

    // Re-filed rows go back only while they're still the import's transfer.
    let restored = 0
    for (const change of changes) {
      const row = await tx.transaction.findUnique({
        where: { id: change.id },
        select: { mark: { select: { categorySource: true } } },
      })
      if (row?.mark?.categorySource !== "transfer") continue
      await tx.transaction.update({ where: { id: change.id }, data: { categoryId: change.categoryId } })
      await tx.transactionMark.update({ where: { transactionId: change.id }, data: { categorySource: change.categorySource } })
      restored++
    }

    await tx.importBatch.delete({ where: { id } })
    return { removed: ids.length, restored }
  })
}

// One transaction, e.g. a duplicate from importing an account in two formats.
export async function deleteTransaction(id: number) {
  return prisma.$transaction(async tx => {
    const row = await tx.transaction.findUnique({ where: { id }, select: { id: true } })
    if (!row) return false
    await tx.transactionMark.deleteMany({ where: { transactionId: id } })
    await tx.transaction.delete({ where: { id } })
    return true
  })
}
