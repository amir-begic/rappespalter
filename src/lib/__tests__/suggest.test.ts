import { describe, expect, it } from "vitest"
import { cleanCamtPayee, payeeBrand, payeeKey } from "../counterparty"
import { KNOWN_BRANDS, KNOWN_WORDS } from "../known-payees"
import { buildMemory, findKnownPayee, suggestByRhythm, suggestCategory } from "../suggest"

// Fictional shops and people, in the forms a Swiss bank's camt entry text takes.
const CARD = "Einkauf Muster Laden-1234 Bern\n01.02.2026, 12:30, Visa Debit-Nr. 123456xxxxxx1234"

describe("cleanCamtPayee", () => {
  it.each([
    [CARD, "Muster Laden-1234 Bern", "merchant"],
    ["Einkauf Foreign Shop\n01.02.2026, 12:30, Visa Debit-Nr. 123456xxxxxx1234\nEUR 7.80, Wechselkurs 0.9462", "Foreign Shop", "merchant"],
    ["Einkauf TWINT, MUSTER AG", "MUSTER AG", "merchant"],
    ["Einkauf TWINT MUSTER AG", "MUSTER AG", "merchant"],
    ["Zahlung TWINT MUSTER, ANNA", "MUSTER, ANNA", "person"],
    ["Zahlung TWINT , ANNA", "ANNA", "person"],
    ["Überweisung TWINT an MUSTER, ANNA", "MUSTER, ANNA", "person"],
    ["Gutschrift TWINT MUSTER, ANNA", "MUSTER, ANNA", "person"],
    ["Gutschrift TWINT MUSTER SHOP", "MUSTER SHOP", "merchant"],
    ["Gutschrift Wechselkurs-Korrektur - neuer Kurs 0.9306\nEinkauf Foreign Shop\n01.02.2026, 12:30", "Foreign Shop", "merchant"],
    ["Bancomat Bezug Musterbank Bern\n01.02.2026, 12:30, Visa Debit-Nr. 123456xxxxxx1234", "Bancomat Bezug Musterbank Bern", "cash"],
    ["Instant-Zahlung Stadt Muster", "Stadt Muster", "other"],
    ["Paketpreis Musterbank\n01.04.2026 - 30.04.2026", "Paketpreis Musterbank", "other"],
    ["Dauerauftrag", "Dauerauftrag", "other"],
  ])("reads %j", (text, name, kind) => {
    expect(cleanCamtPayee(text)).toEqual({ name, kind })
  })
  it("leaves a clean name alone, so it can be cleaned twice", () => {
    expect(cleanCamtPayee("Muster Laden-1234 Bern").name).toBe("Muster Laden-1234 Bern")
  })
})

describe("payeeKey", () => {
  it("treats branches and payment types as one payee", () => {
    expect(payeeKey(CARD)).toBe(payeeKey("Muster Laden-77 Bern"))
    expect(payeeKey("Dauerauftrag Muster AG")).toBe(payeeKey("Instant-Zahlung Muster AG"))
  })
  it("matches the Raiffeisen XLSX form of a TWINT payee", () => {
    expect(payeeKey("MUSTER, ANNA TWINT Nr 123456")).toBe(payeeKey("Zahlung TWINT MUSTER, ANNA"))
  })
  it("groups cash by direction, whichever machine", () => {
    expect(payeeKey("Bancomat Bezug A\n…")).toBe(payeeKey("Bancomat Bezug B"))
    expect(payeeKey("Bancomat Bezug A")).not.toBe(payeeKey("Bancomat Einzahlung A"))
  })
})

describe("payeeBrand", () => {
  it("is the first word of a shop", () => {
    expect(payeeBrand("Einkauf Muster-1 Bern")).toBe("muster")
  })
  it("isn't used for people, cash or short words", () => {
    expect(payeeBrand("Zahlung TWINT MUSTER, ANNA")).toBeNull()
    expect(payeeBrand("MUSTER, ANNA")).toBeNull()
    expect(payeeBrand("Bancomat Bezug Bern")).toBeNull()
    expect(payeeBrand("X-Tra Laden")).toBeNull()
  })
})

describe("suggestCategory", () => {
  const paid = (counterparty: string, categoryId: number, amount = -10) => ({ counterparty, amount, categoryId })

  it("suggests the payee's category, across forms of the name", () => {
    const memory = buildMemory([paid("Muster Laden-7 Bern", 1)])
    expect(suggestCategory(memory, { counterparty: "Muster Laden-1234 Bern", amount: -5 }))
      .toEqual({ categoryId: 1, source: "suggested" })
  })
  it("says nothing when the payee has gone to different categories", () => {
    const memory = buildMemory([paid("Mixed", 1), paid("Mixed", 2)])
    expect(suggestCategory(memory, { counterparty: "Mixed", amount: -5 })).toBeNull()
  })
  it("follows a clear majority", () => {
    const memory = buildMemory([1, 1, 1, 1, 2].map(id => paid("Mostly", id)))
    expect(suggestCategory(memory, { counterparty: "Mostly", amount: -5 })?.categoryId).toBe(1)
  })
  it("keeps money in and out apart", () => {
    const memory = buildMemory([paid("Muster AG", 1)])
    expect(suggestCategory(memory, { counterparty: "Muster AG", amount: 5 })).toBeNull()
  })
  it("falls back on the first word only with enough agreeing payments", () => {
    const two = buildMemory([paid("Muster Bern", 1), paid("Muster Thun", 1)])
    expect(suggestCategory(two, { counterparty: "Muster Chur", amount: -5 })).toBeNull()
    const three = buildMemory([paid("Muster Bern", 1), paid("Muster Thun", 1), paid("Muster Biel", 1)])
    expect(suggestCategory(three, { counterparty: "Muster Chur", amount: -5 }))
      .toEqual({ categoryId: 1, source: "suggested-brand" })
  })
  it("doesn't let a surname stand in for a person", () => {
    const memory = buildMemory([1, 1, 1].map(id => paid("MUSTER, ANNA", id)))
    expect(suggestCategory(memory, { counterparty: "MUSTER, BEAT", amount: -5 })).toBeNull()
  })
})

describe("the built-in list", () => {
  const ids = new Map([["Groceries", 1], ["Dining & Bars", 2], ["Healthcare", 3], ["Mobile", 4], ["Internet", 5], ["Transport", 6]])
  const empty = buildMemory([])
  const suggest = (counterparty: string, amount = -5, memory = empty) => suggestCategory(memory, { counterparty, amount }, ids)

  it("knows brands as whole words, the longest first", () => {
    expect(suggest("Einkauf Migros-123 Bern")).toEqual({ categoryId: 1, source: "suggested-list" })
    expect(suggest("Migros Restaurant Bern")?.categoryId).toBe(2)
    expect(suggest("Migrosa Laden")).toBeNull()
  })
  it("never takes a name that only contains a brand", () => {
    expect(suggest("Migros Bank AG")).toBeNull()
  })
  it("finds words inside compounds and ignores accents", () => {
    expect(suggest("Stadtapotheke Muster")?.categoryId).toBe(3)
    expect(suggest("HOPITAL MUSTER")?.categoryId).toBe(3)
    expect(suggest("Barbara Laden")).toBeNull()
  })
  it("leaves people, cash and money in alone", () => {
    expect(suggest("Zahlung TWINT COOP, ANNA")).toBeNull()
    expect(suggest("Bancomat Bezug Migros Bern")).toBeNull()
    expect(suggest("Migros Bern", 5)).toBeNull()
  })
  it("gives no suggestion for a category the database doesn't have", () => {
    expect(suggest("Hotel Muster")).toBeNull()
    expect(findKnownPayee("Hotel Muster")?.categories).toEqual(["Travel"])
  })
  it("lets the user's history settle an ambiguous brand", () => {
    expect(suggest("Swisscom AG")).toBeNull()
    const history = buildMemory([{ counterparty: "Muster Net", amount: -50, categoryId: 5 }])
    expect(suggest("Swisscom AG", -5, history)).toEqual({ categoryId: 5, source: "suggested-list" })
  })
  it("prefers the user's own history", () => {
    const history = buildMemory([{ counterparty: "Migros Bern", amount: -5, categoryId: 6 }])
    expect(suggest("Migros Bern", -5, history)).toEqual({ categoryId: 6, source: "suggested" })
  })
  it("holds no entry twice", () => {
    const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    for (const lists of [KNOWN_BRANDS, KNOWN_WORDS]) {
      const all = lists.flatMap(l => l.brands.map(fold))
      expect(all.filter((x, i) => all.indexOf(x) !== i)).toEqual([])
    }
  })
})

describe("suggestByRhythm", () => {
  const ids = new Map([["Salary", 1], ["Rent", 2], ["Groceries", 3]])
  const monthly = (counterparty: string, amount: number, months = 4, day = 25) =>
    Array.from({ length: months }, (_, m) => ({ counterparty, amount, date: `2026-0${m + 1}-${String(day).padStart(2, "0")}` }))
  const all = () => true

  it("suggests Salary for a large monthly payment in", () => {
    const rows = monthly("Muster Technik AG", 6200)
    expect([...suggestByRhythm(rows, all, ids).values()]).toEqual([1, 1, 1, 1])
  })

  it("lets a salary vary (bonus month)", () => {
    const rows = monthly("Muster Technik AG", 6200).map((r, i) => i === 2 ? { ...r, amount: 12400 } : r)
    expect(suggestByRhythm(rows, all, ids).size).toBe(4)
  })

  it("ignores small monthly money in and payments from people", () => {
    expect(suggestByRhythm(monthly("Beispiel Verein", 300), all, ids).size).toBe(0)
    expect(suggestByRhythm(monthly("MUSTER, ANNA", 2000), all, ids).size).toBe(0)
  })

  it("suggests Rent for the largest fixed monthly payment out only", () => {
    const rows = [...monthly("Wohnbau Beispiel AG", -1850, 4, 1), ...monthly("Garage Muster", -950, 4, 5)]
    const result = suggestByRhythm(rows, all, ids)
    expect(result.size).toBe(4)
    expect([...result.keys()]).toEqual([0, 1, 2, 3])
    expect(new Set(result.values())).toEqual(new Set([2]))
  })

  it("leaves varying or small payments out alone", () => {
    const varying = monthly("Beispiel Energie", -900).map((r, i) => ({ ...r, amount: -900 - i * 120 }))
    expect(suggestByRhythm(varying, all, ids).size).toBe(0)
    expect(suggestByRhythm(monthly("Beispiel Abo", -40), all, ids).size).toBe(0)
  })

  it("needs a monthly rhythm", () => {
    const rows = ["2026-01-01", "2026-04-01", "2026-07-01", "2026-10-01"]
      .map(date => ({ counterparty: "Wohnbau Beispiel AG", amount: -1850, date }))
    expect(suggestByRhythm(rows, all, ids).size).toBe(0)
  })

  it("only fills open rows, but counts earlier payments", () => {
    const rows = monthly("Wohnbau Beispiel AG", -1850)
    expect([...suggestByRhythm(rows, i => i === 3, ids).keys()]).toEqual([3])
  })

  it("does nothing without the category", () => {
    expect(suggestByRhythm(monthly("Muster Technik AG", 6200), all, new Map()).size).toBe(0)
  })
})

describe("donations in the built-in list", () => {
  it("knows charities and the words for a donation", () => {
    expect(findKnownPayee("Glückskette Genf")?.categories).toEqual(["Donations"])
    expect(findKnownPayee("Médecins Sans Frontières Suisse")?.categories).toEqual(["Donations"])
    expect(findKnownPayee("Spendenkonto Beispielverein")?.categories).toEqual(["Donations"])
  })
  it("keeps charity shops apart", () => {
    expect(findKnownPayee("Caritas Markt Bern")?.categories).toEqual(["Groceries"])
    expect(findKnownPayee("Heilsarmee Brocki Muster")?.categories).toEqual(["Shopping"])
  })
})
