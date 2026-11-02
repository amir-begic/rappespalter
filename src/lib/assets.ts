// Pure maths for other assets (gold, crypto, collectibles, vehicles, …) and the
// loans and leases against them. Tables and loading live in assets-store.ts.
//
// Value of an asset on a day: the latest anchor on or before it — the purchase
// (date + price) or a valuation — held flat (manual) or shrunk by declining-balance
// depreciation since the anchor, never below the residual value (depreciation).
// Nothing before it's bought, nothing from the day it's sold.
//
// Loans and mortgages count against net worth with their balance from the
// repayment schedule (from a statement balance when there is one). A lease is not
// a debt but a commitment — the payments still to come — and the leased vehicle
// isn't yours while it runs, so it's left out of net worth.

// ── Kinds ────────────────────────────────────────────────────────────────────
// Adding a kind of asset = one entry here and a motif in components/asset-art.tsx.
// `name` is what a new asset of the kind is called; `liquid` assets count as
// liquid on Net Worth (sellable within days).

export type Valuation = "manual" | "depreciation"

export interface KindInfo {
  label:        string
  name:         string
  hint:         string
  valuation:    Valuation
  depreciation: number      // default a year for depreciation valuation
  liquid:       boolean
  units:        readonly string[] // offered for the quantity; empty = no quantity
}

export const ASSET_KINDS = {
  gold: {
    label: "Gold & metals", name: "Gold bar", valuation: "manual", depreciation: 0, liquid: true,
    units: ["g", "oz", "kg"], hint: "Bars and coins — update the value now and then from a dealer's buy price.",
  },
  crypto: {
    label: "Crypto", name: "Bitcoin", valuation: "manual", depreciation: 0, liquid: true,
    units: ["BTC", "ETH", "SOL", "coins"], hint: "Coins on an exchange or in a wallet, valued by hand.",
  },
  collectible: {
    label: "Collectibles", name: "Pokémon cards", valuation: "manual", depreciation: 0, liquid: false,
    units: [], hint: "One value for a whole collection — cards, watches, art, sneakers, wine…",
  },
  vehicle: {
    label: "Vehicle", name: "Car", valuation: "depreciation", depreciation: 0.15, liquid: false,
    units: [], hint: "Loses value every year; add a valuation when you get a quote and it carries on from there.",
  },
  other: {
    label: "Other", name: "Something valuable", valuation: "manual", depreciation: 0, liquid: false,
    units: [], hint: "Anything else you could sell.",
  },
} as const satisfies Record<string, KindInfo>

export type AssetKind = keyof typeof ASSET_KINDS
export const isAssetKind = (v: unknown): v is AssetKind => typeof v === "string" && v in ASSET_KINDS
export const kindInfo = (k: AssetKind): KindInfo => ASSET_KINDS[k]

// Collectibles are one umbrella kind; the sub-type only names the collection and
// picks its illustration.
export const COLLECTIBLE_TYPES = [
  "Pokémon cards", "Trading cards", "Stamps & coins", "Watches", "Art", "Sneakers", "Wine", "LEGO", "Other",
] as const

export const LIABILITY_KINDS = {
  loan:     { label: "Loan",     hint: "Paid off in fixed monthly instalments (car loan, private loan)." },
  lease:    { label: "Lease",    hint: "Monthly payments for using a vehicle you don't own." },
  mortgage: { label: "Mortgage", hint: "Usually interest only; enter what you pay a month." },
  other:    { label: "Other",    hint: "Any other debt with a balance." },
} as const

export type LiabilityKind = keyof typeof LIABILITY_KINDS
export const isLiabilityKind = (v: unknown): v is LiabilityKind => typeof v === "string" && v in LIABILITY_KINDS

// ── Types ────────────────────────────────────────────────────────────────────

export interface AssetValuation { id: number; date: string; value: number }

export interface Asset {
  id:               number
  name:             string
  kind:             AssetKind
  subtype:          string | null
  valuation:        Valuation
  quantity:         number | null
  unit:             string | null
  purchaseDate:     string | null
  purchasePrice:    number | null
  depreciationRate: number | null
  residualValue:    number | null
  soldDate:         string | null
  soldPrice:        number | null
  costCategories:   number[]
  notes:            string | null
  values:           AssetValuation[] // oldest first
}

export interface Liability {
  id:             number
  name:           string
  kind:           LiabilityKind
  assetId:        number | null
  principal:      number
  rate:           number
  startDate:      string
  termMonths:     number | null
  monthlyPayment: number | null
  balloon:        number
  balance:        number | null
  balanceDate:    string | null
  counterparty:   string | null
  notes:          string | null
}

// ── Dates (YYYY-MM-DD, calendar days) ────────────────────────────────────────

const utc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10)

export const daysBetween = (from: string, to: string) => (utc(to) - utc(from)) / 86_400_000
export const addDays = (d: string, days: number) => fromUtc(utc(d) + days * 86_400_000)

/** Whole months from `from` to `to` (a month counts once its day is reached). */
export function monthsElapsed(from: string, to: string): number {
  const m = (+to.slice(0, 4) - +from.slice(0, 4)) * 12 + (+to.slice(5, 7) - +from.slice(5, 7))
  return +to.slice(8, 10) < +from.slice(8, 10) ? m - 1 : m
}

/** Last day of a YYYY-MM month. */
export const monthEnd = (month: string) =>
  fromUtc(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0))

export function shiftMonth(month: string, by: number): string {
  const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1 + by, 1))
  return d.toISOString().slice(0, 7)
}

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let m = from; m <= to; m = shiftMonth(m, 1)) out.push(m)
  return out
}

// ── Asset values ─────────────────────────────────────────────────────────────

/** When the asset became yours: its purchase, else its first valuation. */
export const ownedFrom = (a: Asset): string | null => a.purchaseDate ?? a.values[0]?.date ?? null

const rateOf = (a: Asset) => a.valuation === "depreciation" ? (a.depreciationRate ?? kindInfo(a.kind).depreciation) : 0

/** What the asset is worth on `date` (CHF). */
export function assetValueAt(a: Asset, date: string): number {
  const from = ownedFrom(a)
  if (!from || date < from) return 0
  if (a.soldDate && date >= a.soldDate) return 0

  // Latest anchor on or before the date; a valuation beats a purchase on the same day.
  let anchor: { date: string; value: number } | null =
    a.purchaseDate && a.purchasePrice != null ? { date: a.purchaseDate, value: a.purchasePrice } : null
  for (const v of a.values) {
    if (v.date > date) break
    if (!anchor || v.date >= anchor.date) anchor = v
  }
  if (!anchor) return 0

  const rate = rateOf(a)
  if (rate <= 0) return anchor.value
  const years = daysBetween(anchor.date, date) / 365.25
  const value = anchor.value * Math.pow(1 - Math.min(rate, 0.99), years)
  const floor = Math.min(a.residualValue ?? 0, anchor.value)
  return Math.max(floor, value)
}

/** Purchase price vs. today's value, when the purchase price is known. */
export function gainOf(a: Asset, date: string): number | null {
  if (a.purchasePrice == null || a.soldDate) return null
  return assetValueAt(a, date) - a.purchasePrice
}

// ── Loans and leases ─────────────────────────────────────────────────────────

const monthlyRate = (l: Liability) => l.rate / 12

/** Monthly payment: as entered, else the annuity that pays principal down to the
 *  balloon over the term; open-ended without a payment = interest only. */
export function paymentOf(l: Liability): number {
  if (l.monthlyPayment != null) return l.monthlyPayment
  const r = monthlyRate(l)
  const n = l.termMonths
  if (!n) return l.principal * r
  if (r === 0) return (l.principal - l.balloon) / n
  const pv = l.principal - l.balloon / Math.pow(1 + r, n)
  return pv * r / (1 - Math.pow(1 + r, -n))
}

/** End of the term (the day the last payment is due), or null if open-ended. */
export const endOf = (l: Liability): string | null => {
  if (!l.termMonths) return null
  const y = +l.startDate.slice(0, 4), m = +l.startDate.slice(5, 7) - 1 + l.termMonths, d = +l.startDate.slice(8, 10)
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate() // keep e.g. 31 Jan → 28 Feb
  return fromUtc(Date.UTC(y, m, Math.min(d, last)))
}

/** Is a liability running on `date`? (Started, and not past its term.) */
export const isActive = (l: Liability, date: string) =>
  date >= l.startDate && (!l.termMonths || monthsElapsed(l.startDate, date) < l.termMonths)

/** What's still owed on `date` (CHF). Leases owe nothing — see commitmentAt. */
export function debtAt(l: Liability, date: string): number {
  if (l.kind === "lease" || date < l.startDate) return 0
  if (l.termMonths && monthsElapsed(l.startDate, date) >= l.termMonths) return 0

  const useStatement = l.balance != null && l.balanceDate != null && l.balanceDate <= date && l.balanceDate >= l.startDate
  const b0 = useStatement ? l.balance! : l.principal
  const k  = Math.max(0, monthsElapsed(useStatement ? l.balanceDate! : l.startDate, date))
  const p  = paymentOf(l)
  const r  = monthlyRate(l)
  const balance = r === 0 ? b0 - p * k : b0 * Math.pow(1 + r, k) - p * (Math.pow(1 + r, k) - 1) / r
  return Math.max(0, balance)
}

/** Lease payments still to come on `date` (CHF); 0 for everything else. */
export function commitmentAt(l: Liability, date: string): number {
  if (l.kind !== "lease" || date < l.startDate || !l.termMonths) return 0
  return Math.max(0, l.termMonths - monthsElapsed(l.startDate, date)) * paymentOf(l)
}

/** The leases running on `date` for an asset. */
export const leasesOf = (assetId: number, liabilities: Liability[], date: string) =>
  liabilities.filter(l => l.assetId === assetId && l.kind === "lease" && isActive(l, date))

/** What the asset adds to net worth: nothing while it's leased. */
export const ownedValueAt = (a: Asset, liabilities: Liability[], date: string) =>
  leasesOf(a.id, liabilities, date).length ? 0 : assetValueAt(a, date)

// ── Totals ───────────────────────────────────────────────────────────────────

export interface Totals {
  assets:      number // owned value of all assets
  liquid:      number // of which liquid kinds (gold, crypto)
  debts:       number
  commitments: number
  byKind:      Record<AssetKind, number>
}

export function totalsAt(assets: Asset[], liabilities: Liability[], date: string): Totals {
  const byKind = Object.fromEntries(Object.keys(ASSET_KINDS).map(k => [k, 0])) as Record<AssetKind, number>
  let total = 0, liquid = 0
  for (const a of assets) {
    const v = ownedValueAt(a, liabilities, date)
    byKind[a.kind] += v
    total += v
    if (kindInfo(a.kind).liquid) liquid += v
  }
  return {
    assets: total, liquid, byKind,
    debts:       liabilities.reduce((s, l) => s + debtAt(l, date), 0),
    commitments: liabilities.reduce((s, l) => s + commitmentAt(l, date), 0),
  }
}

/** First month anything here is worth or owes something, or null. */
export function firstMonth(assets: Asset[], liabilities: Liability[]): string | null {
  const dates = [
    ...assets.map(ownedFrom).filter((d): d is string => d != null),
    ...liabilities.map(l => l.startDate),
  ].sort()
  return dates[0]?.slice(0, 7) ?? null
}

/** Totals at the end of every month from the first one to `today`'s month (the
 *  month in progress is valued as of today). */
export function monthEndTotals(assets: Asset[], liabilities: Liability[], today: string): Record<string, Totals> {
  const first = firstMonth(assets, liabilities)
  const out: Record<string, Totals> = {}
  if (!first) return out
  const current = today.slice(0, 7)
  for (const m of monthsBetween(first, current)) {
    out[m] = totalsAt(assets, liabilities, m === current ? today : monthEnd(m))
  }
  return out
}

// ── What a vehicle costs a month ─────────────────────────────────────────────
// Depreciation (value lost over the last year, or since it was bought), financing
// (lease payments; interest on a loan — repaying principal isn't a cost), and
// running costs: the average spending in the asset's cost categories over the
// window of complete months, leaving out payments to the lender/leasing company
// (already counted under financing).

export interface CostEntry { month: string; amount: number; categoryId: number | null; counterparty: string }

export interface CarCost {
  depreciation: number
  financing:    { id: number; name: string; kind: LiabilityKind; amount: number }[]
  running:      { categoryId: number; amount: number }[]
  months:       string[] // the window the running costs average over
  total:        number
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()

export function carCost(a: Asset, liabilities: Liability[], entries: CostEntry[], window: string[], today: string): CarCost {
  const leased = leasesOf(a.id, liabilities, today).length > 0
  const owned = ownedFrom(a)

  let depreciation = 0
  if (!leased && owned && owned <= today) {
    const from = [addDays(today, -365), owned].sort().at(-1)!
    const days = daysBetween(from, today)
    depreciation = days >= 28
      ? (assetValueAt(a, from) - assetValueAt(a, today)) / (days / 30.4375)
      : assetValueAt(a, today) * rateOf(a) / 12
    depreciation = Math.max(0, depreciation) // a valuation above the curve isn't a cost
  }

  const mine = liabilities.filter(l => l.assetId === a.id && isActive(l, today))
  const financing = mine.map(l => ({
    id: l.id, name: l.name, kind: l.kind,
    amount: l.kind === "lease" ? paymentOf(l) : debtAt(l, today) * monthlyRate(l),
  }))

  // Only months the asset was yours count towards the average.
  const months = window.filter(m => !owned || m >= owned.slice(0, 7))
  const lenders = mine.map(l => l.counterparty).filter((c): c is string => !!c).map(norm)
  const wanted = new Set(a.costCategories)
  const inWindow = new Set(months)
  const sums = new Map<number, number>()
  for (const e of entries) {
    if (e.categoryId == null || !wanted.has(e.categoryId) || !inWindow.has(e.month)) continue
    if (lenders.some(p => norm(e.counterparty).includes(p))) continue
    sums.set(e.categoryId, (sums.get(e.categoryId) ?? 0) - e.amount)
  }
  const running = a.costCategories.map(id => ({
    categoryId: id,
    amount: months.length ? Math.max(0, (sums.get(id) ?? 0) / months.length) : 0,
  }))

  const total = depreciation + financing.reduce((s, f) => s + f.amount, 0) + running.reduce((s, r) => s + r.amount, 0)
  return { depreciation, financing, running, months, total }
}

/** Categories that look like car costs by name, offered as a starting point. */
export const looksLikeCarCost = (name: string) =>
  /auto|car\b|transport|verkehr|mobilit|fahrzeug|vehicle|benzin|fuel|tank|parking|parkieren|garage|vignette|strassenverkehr|motorfahrzeug|leasing|werkstatt/i.test(name)
