import * as XLSX from "xlsx"

// Parsers for ETF constituent files ("what the fund holds") as published by the
// fund companies. Each issuer has its own layout; the format is detected from
// the content, so the user only has to say which ETF a file belongs to.
// See docs/PORTFOLIO-LOOKTHROUGH.md.

export type Provider = "ishares" | "vanguard" | "xtrackers"
export type AssetClass = "equity" | "cash" | "other"

export interface ConstituentRow {
  ticker:     string | null
  isin:       string | null
  name:       string
  country:    string | null // ISO 3166 alpha-2
  sector:     string | null // GICS sector name
  assetClass: AssetClass
  weight:     number        // fraction of the fund, 0.05 = 5%
}

export interface ConstituentFile {
  provider: Provider
  asOf:     string        // YYYY-MM-DD the data refers to
  fundName: string | null // as printed in the file, if it says
  fundIsin: string | null // Xtrackers: from the file name, used for auto-refresh
  rows:     ConstituentRow[]
}

const PROVIDER_LABELS: Record<Provider, string> = {
  ishares: "iShares", vanguard: "Vanguard", xtrackers: "Xtrackers",
}
export const providerLabel = (p: string) => PROVIDER_LABELS[p as Provider] ?? p

// ── Helpers ─────────────────────────────────────────────────────────────────

type Grid = unknown[][]

const text = (v: unknown) => String(v ?? "").trim()
// Thousands separators vary by locale: 1’234.50 (CH), 1,234.50, $1,234.50, 5.0056%.
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  const s = text(v).replace(/[’',$%\s]/g, "")
  return s === "" || !Number.isFinite(Number(s)) ? null : Number(s)
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const pad = (n: number) => String(n).padStart(2, "0")

// "30/Oct/2026", "30 Sep 2026", "30 Sept 2026", "2026-11-02" → "YYYY-MM-DD".
export function parseLooseDate(s: string): string | null {
  const isoMatch = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return isoMatch[0]
  const m = s.match(/(\d{1,2})[\s/.-]+([A-Za-z]{3,9})[\s/.-]+(\d{4})/)
  if (!m) return null
  const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase())
  return month < 0 ? null : `${m[3]}-${pad(month + 1)}-${pad(Number(m[1]))}`
}

function readGrid(input: Buffer | string, csv: boolean): { grid: Grid; sheetName: string } {
  const wb = typeof input === "string" || csv
    ? XLSX.read(typeof input === "string" ? input : input.toString("utf8"), { type: "string", raw: true })
    : XLSX.read(input, { type: "buffer" })
  const sheetName = wb.SheetNames[0]
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: "", raw: true })
  return { grid, sheetName }
}

// Index of the first row containing all of `labels`, plus a column lookup.
function findHeader(grid: Grid, labels: string[]) {
  for (let i = 0; i < Math.min(grid.length, 40); i++) {
    const cells = grid[i].map(c => text(c).toLowerCase())
    if (labels.every(l => cells.includes(l.toLowerCase()))) {
      return { index: i, col: (label: string) => cells.indexOf(label.toLowerCase()) }
    }
  }
  return null
}

// Country names → ISO codes, built from the runtime's own country names plus
// the spellings issuers use that differ from them.
let countryCodes: Map<string, string> | null = null
const COUNTRY_ALIASES: Record<string, string> = {
  "korea, republic of": "KR", "south korea": "KR", "korea": "KR", "russian federation": "RU",
  "taiwan": "TW", "hong kong": "HK", "czech republic": "CZ", "turkey": "TR", "turkiye": "TR",
  "united states of america": "US", "usa": "US", "uk": "GB", "great britain": "GB",
  "iran, islamic republic of": "IR", "viet nam": "VN", "macau": "MO",
}

export function countryCode(value: string): string | null {
  const v = value.trim()
  if (!v || v === "-") return null
  if (/^[A-Z]{2}$/.test(v)) return v
  if (!countryCodes) {
    countryCodes = new Map(Object.entries(COUNTRY_ALIASES))
    const names = new Intl.DisplayNames(["en"], { type: "region" })
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b)
      const name = names.of(code)
      if (name && name !== code) countryCodes.set(name.toLowerCase(), code)
    }
  }
  return countryCodes.get(v.toLowerCase()) ?? null
}

// iShares/Xtrackers label sectors with GICS, Vanguard with ICB; map onto GICS.
const SECTOR_ALIASES: Record<string, string> = {
  "technology": "Information Technology", "it": "Information Technology",
  "telecommunications": "Communication Services", "communication": "Communication Services",
  "telecommunication services": "Communication Services",
  "basic materials": "Materials", "healthcare": "Health Care",
  "financial": "Financials", "financial services": "Financials",
}

export function normalizeSector(value: string): string | null {
  const v = value.trim()
  if (!v || v === "-" || /^(unknown|other|n\/a|cash and\/or derivatives)$/i.test(v)) return null
  return SECTOR_ALIASES[v.toLowerCase()] ?? v
}

// Real ISINs only; issuers use placeholders like "_CURRENCYUSD" for cash.
const isin = (v: unknown) => {
  const s = text(v).toUpperCase()
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(s) ? s : null
}

// ── iShares (CSV) ───────────────────────────────────────────────────────────
// Fund Holdings as of,"30/Oct/2026"
// Ticker,Name,Sector,Asset Class,Market Value,Weight (%),…,Location,Exchange,Market Currency
// Weights are rounded to 2 dp (small positions show 0.00), so they are
// recomputed from market values.

function parseIShares(grid: Grid): ConstituentFile {
  const head = findHeader(grid, ["Ticker", "Name", "Asset Class", "Market Value", "Weight (%)"])
  if (!head) throw new Error("iShares file: holdings table not found")
  const asOf = parseLooseDate(grid.slice(0, head.index).flat().map(text).join(" "))
  if (!asOf) throw new Error("iShares file: “Fund Holdings as of” date not found")

  const c = {
    ticker: head.col("Ticker"), name: head.col("Name"), sector: head.col("Sector"),
    cls: head.col("Asset Class"), mv: head.col("Market Value"), weight: head.col("Weight (%)"),
    location: head.col("Location"),
  }
  const raw = grid.slice(head.index + 1)
    .filter(r => text(r[c.name]))
    .map(r => {
      const cls = text(r[c.cls]).toLowerCase()
      return {
        ticker:     text(r[c.ticker]) || null,
        isin:       null,
        name:       text(r[c.name]),
        country:    c.location >= 0 ? countryCode(text(r[c.location])) : null,
        sector:     normalizeSector(text(r[c.sector])),
        assetClass: (cls === "equity" ? "equity" : cls.startsWith("cash") || cls.includes("money market") ? "cash" : "other") as AssetClass,
        mv:         num(r[c.mv]) ?? 0,
        pct:        num(r[c.weight]) ?? 0,
      }
    })
  const totalMv = raw.reduce((s, r) => s + r.mv, 0)
  const rows = raw.map(({ mv, pct, ...r }) => ({ ...r, weight: totalMv > 0 ? mv / totalMv : pct / 100 }))
  return { provider: "ishares", asOf, fundName: null, fundIsin: null, rows }
}

// ── Vanguard (XLSX) ─────────────────────────────────────────────────────────
// A few title rows ("Vanguard FTSE All-World …", "As at 30 Sep 2026"), then
// Ticker | Holding name | % of market value | Sector | Region | Market value | Shares.
// Cash is omitted, so weights add up to a little under 100%.

function parseVanguard(grid: Grid): ConstituentFile {
  const head = findHeader(grid, ["Ticker", "Holding name", "% of market value"])
  if (!head) throw new Error("Vanguard file: holdings table not found")
  const title = grid.slice(0, head.index).map(r => text(r[0])).filter(Boolean)
  const asOf = parseLooseDate(title.find(t => /^as (at|of)/i.test(t)) ?? "")
  if (!asOf) throw new Error("Vanguard file: “As at” date not found")
  const fundName = title.find(t => /vanguard/i.test(t) && !/downloaded/i.test(t)) ?? null

  const c = {
    ticker: head.col("Ticker"), name: head.col("Holding name"), pct: head.col("% of market value"),
    sector: head.col("Sector"), region: head.col("Region"),
  }
  const rows: ConstituentRow[] = []
  for (const r of grid.slice(head.index + 1)) {
    const name = text(r[c.name])
    const pct = num(r[c.pct])
    if (!name || pct == null) continue // blank lines and the disclaimer footer
    rows.push({
      ticker:     text(r[c.ticker]) || null,
      isin:       null,
      name,
      country:    c.region >= 0 ? countryCode(text(r[c.region])) : null,
      sector:     c.sector >= 0 ? normalizeSector(text(r[c.sector])) : null,
      assetClass: "equity",
      weight:     pct / 100,
    })
  }
  return { provider: "vanguard", asOf, fundName, fundIsin: null, rows }
}

// ── Xtrackers / DWS (XLSX) ──────────────────────────────────────────────────
// Sheet named after the data date, a disclaimer row, then
// # | Name | ISIN | Country | Currency | Exchange | Type of Security | … | Industry Classification | Weighting.
// Suspended positions (Russia) have "N/A" instead of a weight.

const XTRACKERS_EQUITY = new Set(["equities", "equity", "depository receipts", "preferred stock", "right", "rights"])

function parseXtrackers(grid: Grid, sheetName: string, fileName: string): ConstituentFile {
  const head = findHeader(grid, ["Name", "ISIN", "Weighting"])
  if (!head) throw new Error("Xtrackers file: constituent table not found")
  const asOf = parseLooseDate(sheetName)
  if (!asOf) throw new Error("Xtrackers file: data date not found (expected a sheet named YYYY-MM-DD)")

  const c = {
    name: head.col("Name"), isin: head.col("ISIN"), country: head.col("Country"),
    type: head.col("Type of Security"), sector: head.col("Industry Classification"), weight: head.col("Weighting"),
  }
  const rows: ConstituentRow[] = []
  for (const r of grid.slice(head.index + 1)) {
    const name = text(r[c.name])
    const weight = num(r[c.weight])
    if (!name || weight == null) continue
    const type = text(r[c.type]).toLowerCase()
    rows.push({
      ticker:     null,
      isin:       isin(r[c.isin]),
      name,
      country:    c.country >= 0 ? countryCode(text(r[c.country])) : null,
      sector:     c.sector >= 0 ? normalizeSector(text(r[c.sector])) : null,
      assetClass: XTRACKERS_EQUITY.has(type) ? "equity" : type === "cash" ? "cash" : "other",
      weight,
    })
  }
  const fundIsin = fileName.match(/[A-Z]{2}[A-Z0-9]{9}\d/)?.[0] ?? null
  return { provider: "xtrackers", asOf, fundName: null, fundIsin, rows }
}

// ── Detection ───────────────────────────────────────────────────────────────

export function parseConstituentFile(input: Buffer, fileName = ""): ConstituentFile {
  const head = input.subarray(0, 200).toString("utf8").replace(/^﻿/, "")
  const isZip = input[0] === 0x50 && input[1] === 0x4b // XLSX is a zip archive

  let parsed: ConstituentFile
  if (!isZip && /^\s*fund holdings as of/i.test(head)) {
    parsed = parseIShares(readGrid(input, true).grid)
  } else if (isZip) {
    const { grid, sheetName } = readGrid(input, false)
    if (findHeader(grid, ["Ticker", "Holding name", "% of market value"])) parsed = parseVanguard(grid)
    else if (findHeader(grid, ["Name", "ISIN", "Weighting"])) parsed = parseXtrackers(grid, sheetName, fileName)
    else throw new Error("Unrecognised spreadsheet — supported: Vanguard holdings and Xtrackers constituent exports")
  } else {
    throw new Error("Unrecognised file — supported: iShares holdings CSV, Vanguard and Xtrackers XLSX")
  }

  if (!parsed.rows.some(r => r.assetClass === "equity" && r.weight > 0)) {
    throw new Error(`${providerLabel(parsed.provider)} file contains no weighted holdings`)
  }
  return parsed
}
