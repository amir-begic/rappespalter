import { describe, expect, it } from "vitest"
import { countRepeating, groupByPayee, groupsToCover, isSettlingIn, splitLongTail } from "../review-groups"

const row = (counterparty: string, source: string | null = null, amount = -10) => ({
  counterparty, amount, date: "2026-03-01", categoryId: source ? 1 : null,
  category: source ? { name: "Groceries" } : null, mark: { categorySource: source },
})

describe("groupByPayee", () => {
  it("groups branches, keeps money in and out apart, largest first", () => {
    const groups = groupByPayee([row("Solo"), row("Muster-1 Bern"), row("Muster-2 Bern"), row("Muster-3 Bern", null, 10)])
    expect(groups.map(g => g.items.length)).toEqual([2, 1, 1])
    expect(groups[0].counterparty).toBe("Muster-1 Bern")
  })
  it("shows the group's weakest guess", () => {
    const [g] = groupByPayee([row("Muster", "suggested"), row("Muster", "suggested-list"), row("Muster", "suggested-brand")])
    expect(g.source).toBe("suggested-list")
  })
})

describe("splitLongTail", () => {
  const groups = (singles: number) => [{ items: [1, 2] }, ...Array.from({ length: singles }, () => ({ items: [1] }))]
  it("tucks away a long tail of single payments", () => {
    const { main, tail } = splitLongTail(groups(10))
    expect([main.length, tail.length]).toEqual([1, 10])
  })
  it("keeps a short tail, and never hides everything", () => {
    expect(splitLongTail(groups(9)).tail).toEqual([])
    expect(splitLongTail(groups(12).slice(1)).tail).toEqual([])
  })
})

describe("the nav badge", () => {
  it("counts rows of payees with more than one payment", () => {
    const paid = (counterparty: string) => ({ counterparty, amount: -5 })
    expect(countRepeating([paid("A-1 Bern"), paid("A-2 Bern"), paid("Solo")])).toBe(2)
  })
  it("settles in for the first 30 days", () => {
    const now = new Date("2026-03-31")
    expect(isSettlingIn(new Date("2026-03-10"), now)).toBe(true)
    expect(isSettlingIn(new Date("2026-02-01"), now)).toBe(false)
    expect(isSettlingIn(null, now)).toBe(false)
  })
})

describe("groupsToCover", () => {
  const groups = (sizes: number[]) => sizes.map(n => ({ items: Array(n).fill(0) }))
  it("lists enough groups for 80% of the payments, at least min", () => {
    expect(groupsToCover(groups([50, 30, 10, 5, 5]), 0.8, 1, 60)).toBe(2)
    expect(groupsToCover(groups([50, 30, 10, 5, 5]), 0.8, 3, 60)).toBe(3)
  })
  it("stops at max and at the end", () => {
    expect(groupsToCover(groups(Array(100).fill(1)), 0.8, 20, 60)).toBe(60)
    expect(groupsToCover(groups([2, 2]))).toBe(2)
  })
})
