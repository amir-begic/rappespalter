import { describe, expect, it } from "vitest"
import { findTransferPairs, type TransferCandidate } from "../transfers"

const tx = (date: string, amount: number, account: string, currency = "CHF"): TransferCandidate =>
  ({ date: new Date(date + "T00:00:00Z"), amount, account, currency })

describe("findTransferPairs", () => {
  it("pairs an outflow with the matching inflow on another account", () => {
    expect(findTransferPairs([tx("2026-01-05", -500, "A"), tx("2026-01-06", 500, "B")])).toEqual([[0, 1]])
  })
  it("ignores the same account, other currencies and other amounts", () => {
    expect(findTransferPairs([tx("2026-01-05", -500, "A"), tx("2026-01-05", 500, "A")])).toEqual([])
    expect(findTransferPairs([tx("2026-01-05", -500, "A"), tx("2026-01-05", 500, "B", "EUR")])).toEqual([])
    expect(findTransferPairs([tx("2026-01-05", -500, "A"), tx("2026-01-05", 500.01, "B")])).toEqual([])
  })
  it("only pairs within three days", () => {
    expect(findTransferPairs([tx("2026-01-01", -500, "A"), tx("2026-01-04", 500, "B")])).toHaveLength(1)
    expect(findTransferPairs([tx("2026-01-01", -500, "A"), tx("2026-01-05", 500, "B")])).toEqual([])
  })
  it("pairs two equal transfers one to one, nearest first", () => {
    const pairs = findTransferPairs([
      tx("2026-01-01", -200, "A"), tx("2026-01-03", -200, "A"),
      tx("2026-01-03", 200, "B"), tx("2026-01-01", 200, "B"),
    ])
    expect(pairs).toEqual([[0, 3], [1, 2]])
  })
  it("leaves rows without an account alone", () => {
    expect(findTransferPairs([tx("2026-01-05", -500, ""), tx("2026-01-05", 500, "B")])).toEqual([])
  })
})
