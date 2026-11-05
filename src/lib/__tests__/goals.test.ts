import { describe, expect, it } from "vitest"
import { allocate, homeTarget, progressOf, zeroAssets, type Goal } from "../goals"

const goal = (id: number, allocations: Goal["allocations"]): Goal =>
  ({ id, name: `Goal ${id}`, kind: "travel" as Goal["kind"], target: 10_000, targetDate: null, params: null, allocations })

describe("homeTarget", () => {
  it("is price × (down payment + costs)", () => {
    expect(homeTarget({ price: 1_000_000, depositPct: 20, costsPct: 5 })).toBe(250_000)
  })
})

describe("allocate", () => {
  const balances = { ...zeroAssets(), savings: 10_000 }

  it("takes fixed amounts first, then percentages of the rest", () => {
    const goals = [
      goal(1, [{ asset: "savings", mode: "amount", value: 2_000 }]),
      goal(2, [{ asset: "savings", mode: "percent", value: 50 }]),
    ]
    const a = allocate(goals, balances)
    expect(a.amountOf(goals[0].allocations[0])).toBe(2_000)
    expect(a.amountOf(goals[1].allocations[0])).toBe(4_000)
    expect(a.byAsset.savings.free).toBe(4_000)
    expect(a.byAsset.savings.over).toBe(false)
  })

  it("scales over-allocation down and flags it, never counting money twice", () => {
    const goals = [
      goal(1, [{ asset: "savings", mode: "percent", value: 80 }]),
      goal(2, [{ asset: "savings", mode: "percent", value: 80 }]),
    ]
    const a = allocate(goals, balances)
    const total = goals.reduce((s, g) => s + a.amountOf(g.allocations[0]), 0)
    expect(total).toBeCloseTo(10_000, 6)
    expect(a.byAsset.savings.over).toBe(true)
  })

  it("scales fixed amounts above the balance", () => {
    const goals = [goal(1, [{ asset: "savings", mode: "amount", value: 15_000 }])]
    expect(allocate(goals, balances).amountOf(goals[0].allocations[0])).toBe(10_000)
  })

  it("gives percentage goals their share of the savings pace", () => {
    const goals = [goal(1, [{ asset: "savings", mode: "percent", value: 25 }])]
    const a = allocate(goals, balances)
    const p = progressOf(goals[0], a, { ...zeroAssets(), savings: 800 })
    expect(p.current).toBe(2_500)
    expect(p.monthly).toBe(200)
  })
})
