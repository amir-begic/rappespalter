import { createHash } from "node:crypto"
import * as XLSX from "xlsx"

// Parser for Yuh "Activities" CSV exports (semicolon-separated, UTF-8 with BOM,
// DD/MM/YYYY dates, text fields wrapped in extra quotes). Order amounts already
// include the fee; dividend credits are net of withholding tax (FEES column).

export type ActivityType =
  "buy" | "sell" | "dividend" | "deposit" | "withdrawal" | "fx" | "reward" | "other"

export interface ParsedActivity {
  date:            Date
  type:            ActivityType
  symbol:          string | null
  securityName:    string | null // dividends: name used to find the symbol
  quantity:        number | null
  price:           number | null
  amount:          number
  currency:        string
  fee:             number
  tax:             number
  counterAmount:   number | null
  counterCurrency: string | null
  description:     string
  sourceHash:      string
}

export interface ParseResult {
  activities: ParsedActivity[]
  securities: Map<string, { name: string; currency: string }>
  skipped:    { rejected: number; unknown: string[] }
}

const REQUIRED_COLUMNS = ["DATE", "ACTIVITY TYPE", "ACTIVITY NAME", "DEBIT", "CREDIT", "ASSET"]

const text = (v: unknown) => String(v ?? "").trim().replace(/^"+|"+$/g, "").trim()
const num  = (v: unknown) => {
  const s = text(v).replace(/'/g, "")
  return s === "" || !Number.isFinite(Number(s)) ? null : Number(s)
}
const isCurrency = (s: string) => /^[A-Z]{3}$/.test(s)

function parseDate(v: unknown): Date | null {
  const m = text(v).match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null
}

// "4.553x World (Vanguard FTSE All-World Dis)" → "World (Vanguard FTSE All-World Dis)"
const orderName = (s: string) => s.replace(/^[\d.,']+x\s+/, "")
// "World (Vanguard …) Dividend" → "World (Vanguard …)"
const DIVIDEND_RE = /\s+(dividend|capital gain|distribution)$/i

// The file isn't a Yuh activity export; `missing` are the columns it lacks. The
// import route words it in the user's language.
export class YuhFormatError extends Error {
  constructor(public missing: string[]) {
    super(`Not a Yuh activity export (missing: ${missing.join(", ")})`)
  }
}

export function parseYuhCSV(input: Buffer | string): ParseResult {
  const raw = (typeof input === "string" ? input : input.toString("utf8")).replace(/^﻿/, "")
  const wb  = XLSX.read(raw, { type: "string", FS: ";", raw: true })
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    wb.Sheets[wb.SheetNames[0]], { raw: true, defval: "" }
  )

  const columns = rows.length ? Object.keys(rows[0]) : []
  const missing = REQUIRED_COLUMNS.filter(c => !columns.includes(c))
  if (missing.length) throw new YuhFormatError(missing)

  const activities: ParsedActivity[] = []
  const securities = new Map<string, { name: string; currency: string }>()
  const skipped = { rejected: 0, unknown: [] as string[] }
  const occurrences = new Map<string, number>()

  for (const r of rows) {
    const date = parseDate(r["DATE"])
    const kind = text(r["ACTIVITY TYPE"])
    if (!date || !kind) continue

    // Identical rows are legitimate (e.g. several "Investing bonus" rewards on
    // one day), so the hash includes how often this exact row has been seen.
    const line = columns.map(c => text(r[c])).join("|")
    const seen = (occurrences.get(line) ?? 0) + 1
    occurrences.set(line, seen)
    const sourceHash = createHash("sha256").update(`yuh|${line}|${seen}`).digest("hex")

    const name     = text(r["ACTIVITY NAME"])
    const debit    = num(r["DEBIT"])
    const credit   = num(r["CREDIT"])
    const debitCcy = text(r["DEBIT CURRENCY"])
    const creditCcy = text(r["CREDIT CURRENCY"])
    const fee      = num(r["FEES/COMMISSION"]) ?? 0
    const quantity = num(r["QUANTITY"])
    const asset    = text(r["ASSET"]) || null

    const base = {
      date, sourceHash, description: name, fee, tax: 0,
      symbol: null as string | null, securityName: null as string | null,
      quantity: null as number | null, price: null as number | null,
      counterAmount: null as number | null, counterCurrency: null as string | null,
    }

    if (/REJECTED|CANCEL/.test(kind)) {
      // Declined orders never moved money; their DEBIT columns hold garbage.
      skipped.rejected++
      continue
    }

    if (/^INVEST_.*ORDER_EXECUTED$/.test(kind) && asset) {
      const sell = text(r["BUY/SELL"]).toUpperCase() === "SELL"
      const amount   = sell ? (credit ?? 0) : (debit ?? 0)
      const currency = sell ? creditCcy : debitCcy
      activities.push({
        ...base, type: sell ? "sell" : "buy", symbol: asset,
        quantity, price: num(r["PRICE PER UNIT"]), amount, currency,
      })
      if (!securities.has(asset)) securities.set(asset, { name: orderName(name), currency })
    } else if (kind === "PAYMENT_TRANSACTION_IN") {
      activities.push({ ...base, type: "deposit", amount: credit ?? 0, currency: creditCcy })
    } else if (kind === "PAYMENT_TRANSACTION_OUT") {
      activities.push({ ...base, type: "withdrawal", amount: debit ?? 0, currency: debitCcy })
    } else if (kind === "REWARD_RECEIVED") {
      activities.push({ ...base, type: "reward", symbol: asset, quantity, amount: 0, currency: "CHF" })
    } else if (/^BANK_.*ORDER_EXECUTED$/.test(kind)) {
      // Currency exchange. The sold leg is usually DEBIT/DEBIT CURRENCY, but
      // manual exchanges put it in QUANTITY/ASSET instead.
      const out = debit != null && isCurrency(debitCcy)
        ? { amount: debit, currency: debitCcy }
        : quantity != null && asset && isCurrency(asset)
          ? { amount: -Math.abs(quantity), currency: asset }
          : null
      if (!out || credit == null || !isCurrency(creditCcy)) { skipped.unknown.push(kind); continue }
      activities.push({ ...base, type: "fx", ...out, counterAmount: credit, counterCurrency: creditCcy })
    } else if (DIVIDEND_RE.test(name) && credit != null) {
      activities.push({
        ...base, type: "dividend", securityName: name.replace(DIVIDEND_RE, ""),
        amount: credit, currency: creditCcy, fee: 0, tax: fee,
      })
    } else if (debit != null || credit != null) {
      activities.push({
        ...base, type: "other",
        amount: debit ?? credit ?? 0, currency: debit != null ? debitCcy : creditCcy,
      })
    } else {
      skipped.unknown.push(kind)
    }
  }

  // Dividends carry only a name — map it to the symbol of the order with that name.
  const byName = new Map([...securities].map(([sym, s]) => [s.name.toLowerCase(), sym]))
  for (const a of activities) {
    if (a.type === "dividend" && a.securityName) a.symbol = byName.get(a.securityName.toLowerCase()) ?? null
  }

  return { activities, securities, skipped }
}
