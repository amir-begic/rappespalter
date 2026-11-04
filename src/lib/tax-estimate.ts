// Income and wealth tax estimate (Tax page). Pure: the profile an estimate needs,
// what counts as taxable wealth on 31 December, and the exact request the ESTV
// calculator gets (estv.ts sends it). Deductions, allowances and tariffs are
// ESTV's; the amounts are only a starting point the user can overwrite.

export const RELATIONSHIPS = ["single", "married", "partnership"] as const
export type Relationship = (typeof RELATIONSHIPS)[number]
export const CHURCHES = ["none", "protestant", "roman", "christ"] as const
export type Church = (typeof CHURCHES)[number]

/** The ESTV tax calculator's public page, linked wherever the app names ESTV. */
export const ESTV_CALCULATOR_URL = "https://swisstaxcalculator.estv.admin.ch/"

/** The calculator's first year with tax rules. */
export const FIRST_ESTV_YEAR = 2010
export const MAX_CHILDREN = 9

export interface TaxLocation { id: number; zip: string; city: string; canton: string }

export interface TaxProfile {
  location:      TaxLocation | null
  relationship:  Relationship
  children:      number
  church:        Church
  partnerChurch: Church // only for married couples and registered partnerships
}

export const DEFAULT_PROFILE: TaxProfile = {
  location: null, relationship: "single", children: 0, church: "none", partnerChurch: "none",
}

export const hasPartner = (p: TaxProfile) => p.relationship !== "single"

const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  list.includes(v as T) ? v as T : fallback

function parseLocation(v: unknown): TaxLocation | null {
  if (!v || typeof v !== "object") return null
  const l = v as Record<string, unknown>
  return Number.isInteger(l.id) && typeof l.zip === "string" && typeof l.city === "string" && typeof l.canton === "string"
    ? { id: l.id as number, zip: l.zip, city: l.city, canton: l.canton }
    : null
}

/** A saved or submitted profile, with anything missing or invalid set to the default. */
export function parseProfile(raw: unknown): TaxProfile {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PROFILE }
  const p = raw as Record<string, unknown>
  const children = Number(p.children)
  return {
    location:      parseLocation(p.location),
    relationship:  oneOf(RELATIONSHIPS, p.relationship, DEFAULT_PROFILE.relationship),
    children:      Number.isInteger(children) ? Math.min(MAX_CHILDREN, Math.max(0, children)) : 0,
    church:        oneOf(CHURCHES, p.church, DEFAULT_PROFILE.church),
    partnerChurch: oneOf(CHURCHES, p.partnerChurch, DEFAULT_PROFILE.partnerChurch),
  }
}

// ── Taxable wealth ───────────────────────────────────────────────────────────
// Bank balances from the year-end snapshot, securities from the broker import
// (else the snapshot's ETF balance), other assets at their value on 31 December,
// less debts. Säule 3a and 2. Säule aren't wealth for tax; lease commitments
// aren't debts.

export type WealthLineKey = "checking" | "savings" | "securities" | "etf" | "assets" | "debts"
export interface WealthLine { key: WealthLineKey; amount: number }

export interface WealthSources {
  snapshot:  { checking: number; savings: number; etf: number } | null
  portfolio: { hasData: boolean; value: number }
  assets:    number
  debts:     number
}

export function taxableWealth(s: WealthSources): { lines: WealthLine[]; total: number } {
  const lines: WealthLine[] = []
  if (s.snapshot) {
    lines.push({ key: "checking", amount: s.snapshot.checking }, { key: "savings", amount: s.snapshot.savings })
  }
  if (s.portfolio.hasData) lines.push({ key: "securities", amount: s.portfolio.value })
  else if (s.snapshot) lines.push({ key: "etf", amount: s.snapshot.etf })
  if (s.assets) lines.push({ key: "assets", amount: s.assets })
  if (s.debts) lines.push({ key: "debts", amount: -s.debts })
  const rounded = lines.map(l => ({ ...l, amount: Math.round(l.amount) }))
  return { lines: rounded, total: Math.max(0, rounded.reduce((sum, l) => sum + l.amount, 0)) }
}

// ── What ESTV gets ───────────────────────────────────────────────────────────

/** Everything sent for one estimate — no names or accounts. Incomes are net
 *  (after social contributions, as on the salary certificate). */
export interface TaxRequest {
  year:          number
  locationId:    number
  relationship:  Relationship
  children:      number
  church:        Church
  partnerChurch: Church | null
  age:           number
  income:        number
  partnerIncome: number | null
  wealth:        number
}

export interface TaxAmounts { income: number; partnerIncome: number; wealth: number }

const amount = (n: number) => Math.max(0, Math.round(n))

export function taxRequest(profile: TaxProfile, year: number, age: number, a: TaxAmounts): TaxRequest | null {
  if (!profile.location) return null
  const partner = hasPartner(profile)
  return {
    year,
    locationId:    profile.location.id,
    relationship:  profile.relationship,
    children:      profile.children,
    church:        profile.church,
    partnerChurch: partner ? profile.partnerChurch : null,
    // The calculator takes ages 18–100.
    age:           Math.min(100, Math.max(18, Math.round(age))),
    income:        amount(a.income),
    partnerIncome: partner ? amount(a.partnerIncome) : null,
    wealth:        amount(a.wealth),
  }
}

/** Two requests that would give the same answer. */
export const sameRequest = (a: TaxRequest, b: TaxRequest) =>
  (Object.keys(a) as (keyof TaxRequest)[]).every(k => a[k] === b[k])

/** ESTV's answer in CHF. `headTax`: the flat per-person tax some cantons levy. */
export interface TaxResult {
  income:  { federal: number; canton: number; city: number; church: number }
  wealth:  { canton: number; city: number; church: number }
  headTax: number
  total:   number
}

/** A saved estimate: what was asked, where, and ESTV's answer. */
export interface TaxEstimate {
  request:  TaxRequest
  location: TaxLocation
  result:   TaxResult
  at:       string // ISO time it was calculated
}
