import { describe, expect, it } from "vitest"
import { annuity, compareDeal, DEAL_DEFAULTS, leaseRate } from "../car"

describe("annuity", () => {
  it("splits evenly without interest", () => {
    expect(annuity(12_000, 0, 12)).toBe(1_000)
  })
  it("repays the loan exactly", () => {
    const amount = 30_000, r = 0.04 / 12, n = 48
    const pmt = annuity(amount, r, n)
    let balance = amount
    for (let i = 0; i < n; i++) balance = balance * (1 + r) - pmt
    expect(balance).toBeCloseTo(0, 6)
  })
})

describe("compareDeal", () => {
  it("returns cash, loan and lease with consistent totals", () => {
    const options = compareDeal(DEAL_DEFAULTS)
    expect(options.map(o => o.key)).toEqual(["cash", "loan", "lease"])
    for (const o of options) expect(o.total).toBeCloseTo(o.paid + o.missed - o.resale, 6)
    expect(options.find(o => o.key === "lease")!.resale).toBe(0)
  })
})

describe("leaseRate", () => {
  it("recovers the rate a lease was priced at", () => {
    const years = 4, n = 48, r = 0.05 / 12, price = 40_000, down = 4_000, residual = 18_000
    // Monthly payment that makes down + payments + buyout worth the price at 5%.
    const monthly = (price - down - residual / (1 + r) ** n) * r / (1 - (1 + r) ** -n)
    const rate = leaseRate({ ...DEAL_DEFAULTS, years, price, leaseDown: down, leaseResidual: residual, leaseMonthly: monthly })
    expect(rate).not.toBeNull()
    expect(rate!).toBeCloseTo(0.05, 6)
  })
})
