import { describe, expect, it } from "vitest"
import { groupByPayee, type FlowPayment } from "../flow"

const pay = (counterparty: string, amount: number, bookingText: string | null = null): FlowPayment =>
  ({ counterparty, amount, bookingText })

describe("groupByPayee", () => {
  it("adds up a payee's payments, largest payee first", () => {
    const { groups, rest } = groupByPayee([pay("Muster AG", -10), pay("Beispiel GmbH", -50), pay("Muster AG", -15)], 12)
    expect(groups).toEqual([{ name: "Beispiel GmbH", value: 50 }, { name: "Muster AG", value: 25 }])
    expect(rest).toBeNull()
  })

  it("treats payment types as the same payee", () => {
    const { groups } = groupByPayee([pay("Dauerauftrag Muster AG", -10), pay("Zahlung Muster AG", -5), pay("Muster AG", -1)], 12)
    expect(groups).toEqual([{ name: "Muster AG", value: 16 }])
  })

  it("uses the booking text when the counterparty is only a payment type", () => {
    const { groups } = groupByPayee([pay("Dauerauftrag", -10, "Dauerauftrag\nMuster AG\nMusterstrasse 1")], 12)
    expect(groups).toEqual([{ name: "Muster AG", value: 10 }])
  })

  it("keeps only the first line of a counterparty with an address", () => {
    const { groups } = groupByPayee([pay("Muster AG\nMusterstrasse 1\n9000 St. Gallen", -10), pay("Muster AG", -5)], 12)
    expect(groups).toEqual([{ name: "Muster AG", value: 15 }])
  })

  it("ignores case, keeping the first spelling", () => {
    const { groups } = groupByPayee([pay("MUSTER AG", -10), pay("Muster AG", -5)], 12)
    expect(groups).toEqual([{ name: "MUSTER AG", value: 15 }])
  })

  it("keeps exactly max payees unmerged", () => {
    const { groups, rest } = groupByPayee([pay("A", -3), pay("B", -2), pay("C", -1)], 3)
    expect(groups).toHaveLength(3)
    expect(rest).toBeNull()
  })

  it("merges the smallest past max, and the total stays the same", () => {
    const { groups, rest } = groupByPayee([pay("A", -5), pay("B", -4), pay("C", -3), pay("D", -2), pay("E", -1)], 3)
    expect(groups.map(g => g.name)).toEqual(["A", "B"])
    expect(rest).toEqual({ count: 3, value: 6 })
  })

  it("returns nothing for no payments", () => {
    expect(groupByPayee([], 12)).toEqual({ groups: [], rest: null })
  })
})
