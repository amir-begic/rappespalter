import { describe, expect, it } from "vitest"
import { payeeName, resolveCounterparty } from "../counterparty"

describe("resolveCounterparty", () => {
  it("appends the payee from line 2 of the booking text to a bare payment type", () => {
    expect(resolveCounterparty("Dauerauftrag", "Dauerauftrag\nMuster AG\nMusterstrasse 1")).toBe("Dauerauftrag Muster AG")
  })
  it("leaves real names and mismatched booking texts alone", () => {
    expect(resolveCounterparty("Migros", "Migros\nZürich")).toBe("Migros")
    expect(resolveCounterparty("Dauerauftrag", "Something else\nMuster AG")).toBe("Dauerauftrag")
  })
})

describe("payeeName", () => {
  it("strips the payment type", () => {
    expect(payeeName("Dauerauftrag Muster AG")).toBe("Muster AG")
    expect(payeeName("Instant-Zahlung Muster AG")).toBe("Muster AG")
    expect(payeeName(" Muster AG ")).toBe("Muster AG")
  })
})
