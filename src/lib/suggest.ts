// Category suggestions from what's already been filed: a payee that has always gone
// to one category is suggested there again. Rows with no category of their own get
// one on import, marked as suggested, and stay in the review inbox until confirmed.
// With no history to go on, known brands and common words (known-payees.ts) give a
// weaker suggestion. All local: nothing leaves the computer. Pure — the import route
// loads the history.
import { cleanCamtPayee, payeeBrand, payeeKey } from "./counterparty"
import { KNOWN_BRANDS, KNOWN_WORDS, NOT_THE_BRAND, type KnownPayees } from "./known-payees"
import { findCadence } from "./recurring"

// "suggested": this payee before. "suggested-brand": only another payee with the
// same first word. "suggested-list": only the built-in list. "suggested-rhythm": only
// a monthly pattern (salary, rent). The weaker three are left out of "accept all",
// for a closer look.
export const SUGGESTED_SOURCES = ["suggested", "suggested-brand", "suggested-list", "suggested-rhythm"] as const
export type SuggestedSource = (typeof SUGGESTED_SOURCES)[number]

// Starting values, chosen by judgement. Only these were tested, not alternatives.
const MIN_PAYEE_AGREEMENT = 0.8
const MIN_BRAND_AGREEMENT = 0.9
const MIN_BRAND_PAYMENTS  = 3

type Counts = Map<number, number>
export interface PayeeMemory {
  payees:     Map<string, Counts>
  brands:     Map<string, Counts>
  categories: Counts // how often each category was used, to settle ambiguous brands
}

interface Payment { counterparty: string; amount: number }

// Money in and out of the same name are different things (a shop and its refund).
const side = (tx: Payment) => (tx.amount > 0 ? "in:" : "out:")

function count(map: Map<string, Counts>, key: string, categoryId: number) {
  const counts = map.get(key) ?? new Map<number, number>()
  counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1)
  map.set(key, counts)
}

// `history`: confirmed categories only. Unconfirmed suggestions would feed themselves.
export function buildMemory(history: (Payment & { categoryId: number })[]): PayeeMemory {
  const memory: PayeeMemory = { payees: new Map(), brands: new Map(), categories: new Map() }
  for (const tx of history) {
    memory.categories.set(tx.categoryId, (memory.categories.get(tx.categoryId) ?? 0) + 1)
    const key = payeeKey(tx.counterparty)
    if (key) count(memory.payees, side(tx) + key, tx.categoryId)
    const brand = payeeBrand(tx.counterparty)
    if (brand) count(memory.brands, side(tx) + brand, tx.categoryId)
  }
  return memory
}

function leader(counts: Counts | undefined) {
  if (!counts) return null
  let total = 0, categoryId = -1, most = 0
  for (const [id, n] of counts) {
    total += n
    if (n > most) { most = n; categoryId = id }
  }
  return { categoryId, total, agreement: most / total }
}

// The built-in list, indexed once: a row costs a few map lookups, not one per entry.
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}&]+/gu, " ").trim()

function index(lists: KnownPayees[]) {
  return new Map(lists.flatMap(list => list.brands.map(name => [fold(name), list] as const)))
}
const brands = index(KNOWN_BRANDS)
const words = index(KNOWN_WORDS)
const blocked = new Set(NOT_THE_BRAND.map(fold))
const insideWords = [...words.keys()].filter(w => w.length >= 6).sort((a, b) => b.length - a.length)
const longestEntry = Math.max(...[...brands.keys(), ...words.keys(), ...blocked].map(w => w.split(" ").length))

// Runs of words in the name, longest first, so the most specific entry is found first.
function* phrases(name: string) {
  const tokens = name.split(" ")
  for (let n = Math.min(longestEntry, tokens.length); n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) yield tokens.slice(i, i + n).join(" ")
  }
}

export function findKnownPayee(counterparty: string): KnownPayees | null {
  const name = fold(cleanCamtPayee(counterparty).name)
  const found = [...phrases(name)]
  if (found.some(p => blocked.has(p))) return null
  const brand = found.find(p => brands.has(p))
  if (brand) return brands.get(brand)!
  const word = found.find(p => words.has(p)) ?? insideWords.find(w => name.includes(w))
  return word ? words.get(word)! : null
}

function knownCategory(known: KnownPayees, memory: PayeeMemory, categoryIds: Map<string, number>): number | null {
  const present = known.categories.flatMap(name => categoryIds.get(name) ?? [])
  if (!known.ambiguous || present.length < 2) return present[0] ?? null
  // Several could be right: only a clear preference in the user's own history decides.
  const used = present.map(id => ({ id, n: memory.categories.get(id) ?? 0 })).sort((a, b) => b.n - a.n)
  return used[0].n > used[1].n ? used[0].id : null
}

// `categoryIds`: category name → id, for the built-in list.
export function suggestCategory(
  memory: PayeeMemory, tx: Payment, categoryIds: Map<string, number> = new Map(),
): { categoryId: number; source: SuggestedSource } | null {
  const key = payeeKey(tx.counterparty)
  const payee = key ? leader(memory.payees.get(side(tx) + key)) : null
  if (payee && payee.agreement >= MIN_PAYEE_AGREEMENT) return { categoryId: payee.categoryId, source: "suggested" }

  const brandName = payeeBrand(tx.counterparty)
  const brand = brandName ? leader(memory.brands.get(side(tx) + brandName)) : null
  if (brand && brand.agreement >= MIN_BRAND_AGREEMENT && brand.total >= MIN_BRAND_PAYMENTS) {
    return { categoryId: brand.categoryId, source: "suggested-brand" }
  }

  // Shops only: not people, cash or money coming in.
  const { name, kind } = cleanCamtPayee(tx.counterparty)
  if (tx.amount >= 0 || kind === "person" || kind === "cash" || name.includes(",")) return null
  const known = findKnownPayee(tx.counterparty)
  const categoryId = known && knownCategory(known, memory, categoryIds)
  return categoryId != null ? { categoryId, source: "suggested-list" } : null
}

// Monthly patterns, for payees nothing else knows (a first import has no history):
// a large amount coming in from one payer every month is a salary; a large fixed
// amount going to one payee every month is the rent. Starting values, by judgement.
const SALARY_MIN = 1500 // CHF, the typical monthly amount
const RENT_MIN   = 800
const FIXED_SHARE = 0.75 // of the payments within 1% of the typical amount

export interface DatedPayment extends Payment { date: string } // YYYY-MM-DD

// `rows`: this import and earlier payments, for a longer view of each payee. Only the
// rows `open` says are still without a category get a suggestion: row index → id.
// Rent goes to one payee only, the largest; a second large fixed payment is more
// likely a loan, a lease or saving than a second flat.
export function suggestByRhythm(
  rows: DatedPayment[], open: (index: number) => boolean, categoryIds: Map<string, number>,
): Map<number, number> {
  const salaryId = categoryIds.get("Salary") ?? categoryIds.get("Income")
  const rentId = categoryIds.get("Rent")
  const groups = new Map<string, number[]>()
  rows.forEach((tx, i) => {
    const { name, kind } = cleanCamtPayee(tx.counterparty)
    const key = payeeKey(name)
    if (!key || kind === "cash" || kind === "person" || name.includes(",")) return
    const list = groups.get(side(tx) + key) ?? []
    list.push(i)
    groups.set(side(tx) + key, list)
  })

  const result = new Map<number, number>()
  let rent: { indexes: number[]; amount: number } | null = null
  for (const indexes of groups.values()) {
    if (!indexes.some(open)) continue
    const items = indexes.map(i => rows[i]).sort((a, b) => a.date.localeCompare(b.date))
    if (findCadence(items)?.cadence !== "monthly") continue
    const amounts = items.map(tx => Math.abs(tx.amount)).sort((a, b) => a - b)
    const typical = amounts[amounts.length >> 1]
    if (items[0].amount > 0) {
      if (salaryId != null && typical >= SALARY_MIN) indexes.filter(open).forEach(i => result.set(i, salaryId))
    } else {
      const fixed = amounts.filter(a => Math.abs(a - typical) <= typical * 0.01).length / amounts.length
      if (typical >= RENT_MIN && fixed >= FIXED_SHARE && typical > (rent?.amount ?? 0)) rent = { indexes, amount: typical }
    }
  }
  if (rent && rentId != null) rent.indexes.filter(open).forEach(i => result.set(i, rentId))
  return result
}
