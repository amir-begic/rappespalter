import { prisma } from "@/lib/prisma"
import type { Prisma } from "../../generated/prisma/client"

// Per-transaction flags (one-off, how the category was set, reviewed): a table
// of their own rather than Transaction columns.

// How a transaction got its category. "fallback" means the parser couldn't map
// the bank's category and used FALLBACK_CATEGORY — those go to the review inbox.
// "transfer" means a movement between own accounts (a known name or a pair of
// opposite amounts, src/lib/transfers.ts). "override" is only on rows from older
// imports (built-in merchant overrides, now rules).
export type CategorySource = "rule" | "bank" | "override" | "fallback" | "transfer" | "manual"

// Where clause for "not marked one-off". One-offs (an inheritance, a car) stay in
// totals but are left out of trends, averages and budget comparisons.
export const NOT_ONE_OFF: Prisma.TransactionWhereInput = {
  NOT: { mark: { is: { oneOff: true } } },
}

export type MarkPatch = {
  oneOff?:         boolean
  categorySource?: CategorySource | null
  reviewedAt?:     Date | null
}

export async function setMark(transactionId: number, patch: MarkPatch) {
  return prisma.transactionMark.upsert({
    where:  { transactionId },
    create: { transactionId, ...patch },
    update: patch,
  })
}

export async function setMarks(transactionIds: number[], patch: MarkPatch) {
  return prisma.$transaction(transactionIds.map(transactionId => prisma.transactionMark.upsert({
    where:  { transactionId },
    create: { transactionId, ...patch },
    update: patch,
  })))
}
