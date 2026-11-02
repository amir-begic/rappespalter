// Look-through: break ETFs down into the companies they hold, combine them with
// directly held stocks, and add up the CHF exposure per company, country and
// sector. Pure, like engine.ts. See docs/PORTFOLIO-LOOKTHROUGH.md.

import { currencyForCountry, type ConstituentRow } from "./constituents"

export interface LookThroughPosition {
  symbol: string
  name:   string
  value:  number // CHF, today
  // Constituents of a fund; null for a stock held directly or a fund without data.
  constituents: ConstituentRow[] | null
  isFund: boolean
  currency?: string | null // for a stock held directly: its trading currency
}

export interface Company {
  name:    string
  country: string | null
  sector:  string | null
  value:   number                          // CHF
  share:   number                          // of all securities
  via:     { symbol: string; value: number }[] // largest first
}

export interface Bucket { key: string; value: number; share: number }

export interface LookThroughResult {
  total:          number // all securities, CHF
  lookedThrough:  number // value of funds with constituent data + direct stocks
  notLookedThrough: { symbol: string; name: string; value: number }[]
  cashOther:      number // cash, derivatives, funds-in-funds and unlisted remainder
  companies:      Company[] // largest first
  countries:      Bucket[]
  sectors:        Bucket[]
  // Trading currency of each holding line (a company can trade in several).
  // Files without a currency column fall back to the country's currency.
  currencies:     Bucket[]
  currencyEstimatedShare: number // of the looked-through value, by country fallback
  top10Share:     number | null // of the companies' total
}

// ── Name normalisation ──────────────────────────────────────────────────────

// Legal forms, share-class markers and filler words that differ between issuers
// for the same company ("NESTLE SA" / "Nestle SA Reg", "BYD H" / "BYD Co Ltd").
const NOISE = new Set([
  "CO", "COS", "LTD", "LIMITED", "INC", "INCORPORATED", "CORP", "CORPORATION", "AG", "SA", "SAB", "DE", "CV",
  "PLC", "NV", "SE", "THE", "PJSC", "OJSC", "ASA", "AB", "AS", "OYJ", "SPA", "BHD", "TBK", "PT", "PCL",
  "KK", "KGAA", "LLC", "LP", "HOLDING", "HOLDINGS", "GROUP", "GRP", "COMPANY", "ADR", "ADS", "GDR", "NVDR",
  "REG", "REGS", "NAMEN", "PS", "PAR", "PREF", "PFD", "PREFERENCE", "ORD", "SHS", "UNITS", "UNIT",
  "CLASS", "CL", "SER", "SERIES", "NON", "VOTING", "PRE", "A", "B", "C", "H", "N", "V", "CPO", "UBD",
  "UNI", "DR", "INTL", "INTERNATIONAL",
])

export function normalizeName(name: string): string {
  return name.toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(w => w && !NOISE.has(w))
    .join(" ")
}

// The legal form in a name, unified across spellings. Two rows with the same
// name in different countries are only the same company if their forms agree
// or one doesn't say: "Tencent Holdings" (CN) = "Tencent Holdings Ltd" (HK),
// but "Siemens AG" (DE) ≠ "Siemens Ltd" (IN) and "EQT Corp" (US) ≠ "EQT AB" (SE).
const LEGAL_FORMS: Record<string, string> = {
  AG: "AG", SA: "SA", SAB: "SA", LTD: "LTD", LIMITED: "LTD", INC: "INC", INCORPORATED: "INC",
  CORP: "CORP", CORPORATION: "CORP", PLC: "PLC", AB: "AB", NV: "NV", SE: "SE", ASA: "ASA", OYJ: "OYJ",
  SPA: "SPA", BHD: "BHD", TBK: "TBK", PCL: "PCL", KK: "KK", KGAA: "KGAA", LLC: "LLC", AS: "AS",
  PJSC: "PJSC", OJSC: "PJSC", QPSC: "QPSC", QSC: "QPSC", KSC: "KSC", SAOG: "SAOG",
}
const legalForms = (name: string) =>
  new Set(name.toUpperCase().split(/[^A-Z]+/).map(w => LEGAL_FORMS[w]).filter(Boolean))

// Xtrackers cuts names off at ~34 characters ("INDUSTRIAL AND COMMERCIAL BANK OF").
const looksTruncated = (name: string) => name.length >= 30 && name === name.toUpperCase()
const MIN_PREFIX = 12

// ── Union-find ──────────────────────────────────────────────────────────────

function unionFind(n: number) {
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] }
    return i
  }
  return { find, union: (a: number, b: number) => { parent[find(a)] = find(b) } }
}

// ── Main ────────────────────────────────────────────────────────────────────

interface Piece {
  symbol:  string        // the position it comes from
  value:   number        // CHF
  name:    string
  norm:    string
  ticker:  string | null
  isin:    string | null
  country: string | null
  sector:  string | null
  currency:  string | null
  estimated: boolean // currency guessed from the country
}

export function computeLookThrough(positions: LookThroughPosition[]): LookThroughResult {
  const pieces: Piece[] = []
  const notLookedThrough: LookThroughResult["notLookedThrough"] = []
  let cashOther = 0
  let total = 0

  for (const p of positions) {
    if (p.value <= 0) continue
    total += p.value
    if (!p.isFund) {
      pieces.push({
        symbol: p.symbol, value: p.value, name: p.name, norm: normalizeName(p.name),
        ticker: p.symbol.toUpperCase(), isin: null, country: null, sector: null,
        currency: p.currency ?? null, estimated: false,
      })
      continue
    }
    if (!p.constituents?.length) {
      notLookedThrough.push({ symbol: p.symbol, name: p.name, value: p.value })
      continue
    }
    // Whatever the listed equities don't cover (cash, futures, rounding,
    // cash the issuer leaves out) counts as cash & other, so the fund adds up.
    let equity = 0
    for (const r of p.constituents) {
      if (r.assetClass !== "equity" || r.weight <= 0) continue
      equity += r.weight
      pieces.push({
        symbol: p.symbol, value: p.value * r.weight, name: r.name, norm: normalizeName(r.name),
        ticker: r.ticker?.toUpperCase() ?? null, isin: r.isin, country: r.country, sector: r.sector,
        currency: r.currency ?? currencyForCountry(r.country), estimated: !r.currency,
      })
    }
    cashOther += p.value * (1 - equity)
  }

  // Link pieces that share an ISIN, a ticker in the same country, or a name
  // in the same country.
  const uf = unionFind(pieces.length)
  const firstWith = new Map<string, number>()
  const link = (key: string, i: number) => {
    const j = firstWith.get(key)
    if (j == null) firstWith.set(key, i)
    else uf.union(i, j)
  }
  pieces.forEach((p, i) => {
    if (p.isin) link(`isin:${p.isin}`, i)
    if (p.ticker && p.country) link(`tc:${p.country}:${p.ticker}`, i)
    if (p.norm.length >= 3) link(`nm:${p.country ?? ""}:${p.norm}`, i)
  })

  // The same name across countries (dual listings, an issuer filing Tencent
  // under CN and another under HK): link when the legal forms don't conflict.
  const byName = new Map<string, Map<string, { i: number; forms: Set<string> }[]>>()
  pieces.forEach((p, i) => {
    if (p.norm.length < 3) return
    if (!byName.has(p.norm)) byName.set(p.norm, new Map())
    const byCountry = byName.get(p.norm)!
    const c = p.country ?? ""
    if (!byCountry.has(c)) byCountry.set(c, [])
    byCountry.get(c)!.push({ i, forms: legalForms(p.name) })
  })
  for (const byCountry of byName.values()) {
    const sides = [...byCountry.values()]
    for (let a = 0; a < sides.length; a++) for (let b = a + 1; b < sides.length; b++) {
      const formsA = new Set(sides[a].flatMap(x => [...x.forms]))
      const formsB = new Set(sides[b].flatMap(x => [...x.forms]))
      const unstated = sides[a].some(x => !x.forms.size) || sides[b].some(x => !x.forms.size)
      if (unstated || [...formsA].some(f => formsB.has(f))) uf.union(sides[a][0].i, sides[b][0].i)
    }
  }

  // Directly held stocks carry no country: match them to a fund row with the
  // same ticker whose name starts with the same word ("Apple" ↔ "Apple Inc").
  const byTicker = new Map<string, number[]>()
  pieces.forEach((p, i) => { if (p.ticker && p.country) byTicker.set(p.ticker, [...(byTicker.get(p.ticker) ?? []), i]) })
  pieces.forEach((p, i) => {
    if (p.country || !p.ticker) return
    const word = p.norm.split(" ")[0]
    const hit = (byTicker.get(p.ticker) ?? []).find(j => word && pieces[j].norm.split(" ")[0] === word)
    if (hit != null) uf.union(i, hit)
  })

  // Truncated names: link to a longer name from another fund that starts the same way.
  const sorted = pieces.map((p, i) => ({ norm: p.norm, i })).filter(x => x.norm).sort((a, b) => a.norm < b.norm ? -1 : 1)
  pieces.forEach((p, i) => {
    if (!looksTruncated(p.name) || p.norm.length < MIN_PREFIX) return
    let lo = 0, hi = sorted.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid].norm < p.norm) lo = mid + 1; else hi = mid }
    for (let k = lo; k < sorted.length && sorted[k].norm.startsWith(p.norm); k++) {
      if (pieces[sorted[k].i].symbol !== p.symbol) uf.union(i, sorted[k].i)
    }
  })

  // Aggregate each linked group into one company.
  const groups = new Map<number, Piece[]>()
  pieces.forEach((p, i) => {
    const root = uf.find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(p)
  })

  const companies: Company[] = []
  for (const members of groups.values()) {
    members.sort((a, b) => b.value - a.value)
    const value = members.reduce((s, m) => s + m.value, 0)
    const via = new Map<string, number>()
    members.forEach(m => via.set(m.symbol, (via.get(m.symbol) ?? 0) + m.value))
    // Prefer a properly capitalised name (Vanguard, your broker) over ALL CAPS.
    const named = members.find(m => m.name !== m.name.toUpperCase()) ?? members[0]
    companies.push({
      name:    named.name,
      country: members.find(m => m.country)?.country ?? null,
      sector:  members.find(m => m.sector)?.sector ?? null,
      value,
      share:   total > 0 ? value / total : 0,
      via:     [...via].map(([symbol, v]) => ({ symbol, value: v })).sort((a, b) => b.value - a.value),
    })
  }
  companies.sort((a, b) => b.value - a.value)

  const bucket = (key: (c: Company) => string | null): Bucket[] => {
    const m = new Map<string, number>()
    companies.forEach(c => { const k = key(c) ?? "Unknown"; m.set(k, (m.get(k) ?? 0) + c.value) })
    return [...m].map(([k, v]) => ({ key: k, value: v, share: total > 0 ? v / total : 0 }))
      .sort((a, b) => b.value - a.value)
  }

  const byCurrency = new Map<string, number>()
  let estimated = 0
  for (const p of pieces) {
    const k = p.currency ?? "Unknown"
    byCurrency.set(k, (byCurrency.get(k) ?? 0) + p.value)
    if (p.estimated) estimated += p.value
  }
  const currencies = [...byCurrency].map(([key, value]) => ({ key, value, share: total > 0 ? value / total : 0 }))
    .sort((a, b) => b.value - a.value)
  const piecesTotal = pieces.reduce((s, p) => s + p.value, 0)

  const companiesTotal = companies.reduce((s, c) => s + c.value, 0)
  return {
    total,
    lookedThrough: total - notLookedThrough.reduce((s, p) => s + p.value, 0),
    notLookedThrough,
    cashOther,
    companies,
    countries: bucket(c => c.country),
    sectors:   bucket(c => c.sector),
    currencies,
    currencyEstimatedShare: piecesTotal > 0 ? estimated / piecesTotal : 0,
    top10Share: companiesTotal > 0
      ? companies.slice(0, 10).reduce((s, c) => s + c.value, 0) / companiesTotal
      : null,
  }
}
