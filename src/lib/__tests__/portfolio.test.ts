import { describe, expect, it } from "vitest"
import { allocateContribution } from "../portfolio/allocation"
import { computePortfolio, xirr, type EngineActivity, type EngineSecurity } from "../portfolio/engine"

describe("xirr", () => {
  it("finds 10% for money that grows 10% in a year", () => {
    expect(xirr([{ date: "2025-01-01", amount: -1000 }, { date: "2026-01-01", amount: 1100 }])).toBeCloseTo(0.1, 2)
  })
  it("is null without both an inflow and an outflow", () => {
    expect(xirr([{ date: "2025-01-01", amount: -1000 }, { date: "2026-01-01", amount: -5 }])).toBeNull()
    expect(xirr([{ date: "2025-01-01", amount: -1000 }])).toBeNull()
  })
})

describe("allocateContribution", () => {
  it("adds new money to the underweight holding first and never sells", () => {
    const buys = allocateContribution([8_000, 2_000], [0.5, 0.5], 1_000)
    expect(buys[0]).toBeCloseTo(0, 6)
    expect(buys[1]).toBeCloseTo(1_000, 6)
  })
  it("spends exactly the contribution", () => {
    const buys = allocateContribution([5_000, 3_000, 2_000], [0.6, 0.3, 0.1], 4_000)
    expect(buys.reduce((s, b) => s + b, 0)).toBeCloseTo(4_000, 6)
    expect(buys.every(b => b >= 0)).toBe(true)
  })
  it("returns zeros for nothing to invest", () => {
    expect(allocateContribution([1, 2], [0.5, 0.5], 0)).toEqual([0, 0])
  })
})

describe("computePortfolio", () => {
  const act = (a: Partial<EngineActivity> & Pick<EngineActivity, "date" | "type" | "amount">): EngineActivity => ({
    symbol: null, quantity: null, price: null, currency: "CHF", fee: 0, tax: 0,
    counterAmount: null, counterCurrency: null, ...a,
  })
  const security: EngineSecurity = {
    symbol: "ETF", name: "World ETF", currency: "CHF", kind: "etf",
    priceCurrency: "CHF", priceSource: "yahoo", priceSymbol: "ETF.SW",
  }
  const activities = [
    act({ date: "2025-01-02", type: "deposit", amount: 1_000 }),
    act({ date: "2025-01-03", type: "buy", symbol: "ETF", quantity: 10, price: 100, amount: -1_000 }),
  ]
  const prices = new Map([["ETF", [{ date: "2025-01-03", value: 100 }, { date: "2026-01-02", value: 110 }]]])

  const result = computePortfolio({ activities, securities: [security], prices, fx: new Map(), today: "2026-01-02" })

  it("values the holding at the latest price", () => {
    expect(result.totals.securities).toBeCloseTo(1_100, 6)
    expect(result.totals.cash).toBeCloseTo(0, 6)
    expect(result.holdings[0].units).toBe(10)
    expect(result.holdings[0].costBasis).toBeCloseTo(1_000, 6)
  })
  it("counts gains against net deposits", () => {
    expect(result.totals.netDeposits).toBeCloseTo(1_000, 6)
    expect(result.totals.gain).toBeCloseTo(100, 6)
    expect(result.totals.unrealizedGain).toBeCloseTo(100, 6)
  })
  it("reports about 10% a year", () => {
    expect(result.totals.irr).toBeCloseTo(0.1, 2)
    expect(result.totals.twr).toBeCloseTo(0.1, 2)
  })
  it("has no warnings for a CHF portfolio with prices", () => {
    expect(result.warnings).toEqual([])
  })
})
