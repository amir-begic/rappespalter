import { describe, expect, it } from "vitest"
import { findRule, ruleMatches, type Rule } from "../rules"

const rule = (id: number, pattern: string, matchType = "contains", direction = "any"): Rule =>
  ({ id, pattern, matchType, direction, categoryId: id * 10 })

describe("ruleMatches", () => {
  it("ignores case and extra whitespace", () => {
    expect(ruleMatches(rule(1, "migros"), { counterparty: "MIGROS  Zürich", amount: -5 })).toBe(true)
  })
  it("honours the match type", () => {
    const tx = { counterparty: "Coop Pronto", amount: -5 }
    expect(ruleMatches(rule(1, "pronto", "startsWith"), tx)).toBe(false)
    expect(ruleMatches(rule(1, "coop", "startsWith"), tx)).toBe(true)
    expect(ruleMatches(rule(1, "coop", "equals"), tx)).toBe(false)
    expect(ruleMatches(rule(1, "coop pronto", "equals"), tx)).toBe(true)
  })
  it("honours the direction", () => {
    expect(ruleMatches(rule(1, "x", "contains", "in"), { counterparty: "x", amount: -1 })).toBe(false)
    expect(ruleMatches(rule(1, "x", "contains", "out"), { counterparty: "x", amount: 1 })).toBe(false)
  })
  it("never matches an empty pattern", () => {
    expect(ruleMatches(rule(1, "  "), { counterparty: "anything", amount: -1 })).toBe(false)
  })
})

describe("findRule", () => {
  const tx = { counterparty: "Dauerauftrag Muster AG", amount: -100 }
  it("lets the longest pattern win", () => {
    expect(findRule([rule(1, "muster"), rule(2, "muster ag")], tx)?.id).toBe(2)
  })
  it("breaks ties: equals, then starts with, then contains, then the older rule", () => {
    const p = "dauerauftrag muster ag"
    expect(findRule([rule(1, p, "contains"), rule(2, p, "startsWith"), rule(3, p, "equals")], tx)?.id).toBe(3)
    expect(findRule([rule(5, "muster"), rule(4, "muster")], tx)?.id).toBe(4)
  })
  it("returns null when nothing matches", () => {
    expect(findRule([rule(1, "coop")], tx)).toBeNull()
  })
})
