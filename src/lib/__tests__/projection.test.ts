import { describe, expect, it } from "vitest"
import { addMonths, assumptionsFrom, forecastToRetirement, monthsBetween, projectAfter, RATES, stepMonth } from "../projection"

const zero = { etf: 0, savings: 0, pillar3a: 0, pillar2: 0 }
const plan = assumptionsFrom({ monthlyEtf: 1000, monthly3a: 500, monthlyPillar2: 650 })

describe("month arithmetic", () => {
  it("adds months across year ends, both ways", () => {
    expect(addMonths("2026-11", 2)).toBe("2027-01")
    expect(addMonths("2026-01", -1)).toBe("2025-12")
    expect(addMonths("2026-05", 0)).toBe("2026-05")
  })
  it("counts months between", () => {
    expect(monthsBetween("2025-12", "2026-03")).toBe(3)
    expect(monthsBetween("2026-03", "2026-03")).toBe(0)
  })
})

describe("stepMonth", () => {
  it("compounds monthly and then adds the contribution", () => {
    const b = stepMonth({ ...zero, etf: 12_000 }, plan)
    expect(b.etf).toBeCloseTo(12_000 * (1 + RATES.etf / 12) + 1000, 6)
  })
  it("gives the savings account interest but no contributions", () => {
    const b = stepMonth({ ...zero, savings: 10_000 }, plan)
    expect(b.savings).toBeCloseTo(10_000 * (1 + RATES.savings / 12), 6)
  })
})

describe("projectAfter", () => {
  it("matches the closed form of a monthly annuity", () => {
    const r = RATES.etf / 12, n = 120
    const expected = 1000 * ((1 + r) ** n - 1) / r
    expect(projectAfter(zero, n, plan).etf).toBeCloseTo(expected, 4)
  })
  it("is the start for 0 months", () => {
    expect(projectAfter({ ...zero, etf: 5 }, 0, plan)).toEqual({ ...zero, etf: 5 })
  })
})

describe("forecastToRetirement", () => {
  const points = forecastToRetirement(zero, "2026-03", "1990-07-15", 65, plan)

  it("runs from the start month to the month the person turns 65", () => {
    expect(points[0].month).toBe("2026-03")
    expect(points[0].age).toBe(35)
    expect(points.at(-1)!.month).toBe("2055-07")
    expect(points.at(-1)!.age).toBe(65)
  })
  it("has one point per birthday month in between", () => {
    const middle = points.slice(1, -1)
    expect(middle.every(p => p.month.endsWith("-07"))).toBe(true)
    expect(middle.map(p => p.age)).toEqual(Array.from({ length: middle.length }, (_, i) => 36 + i))
  })
  it("counts contributions paid in", () => {
    const months = monthsBetween("2026-03", "2055-07")
    expect(points.at(-1)!.paidIn).toBe(Math.round(months * 2150))
  })
  it("deflates every amount with inflation", () => {
    const real = forecastToRetirement(zero, "2026-03", "1990-07-15", 65, plan, 0.02)
    expect(real.at(-1)!.total).toBeLessThan(points.at(-1)!.total)
    expect(real[0].total).toBe(points[0].total)
  })
})
