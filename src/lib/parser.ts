import * as XLSX from "xlsx"
import { resolveCounterparty } from "./counterparty"

export interface ParsedTransaction {
  date: Date
  counterparty: string
  // camt: the bank's text before cleaning, so a rule written for it still matches.
  bankText?: string
  amount: number
  currency: string
  account: string
  // App category names to try, in order: the first one the database has wins
  // (older databases call their income category "Income", newer ones "Salary").
  categories: string[]
  // How `categories` was chosen: the bank's own category (CATEGORY_MAP),
  // FALLBACK_CATEGORY because the bank's wasn't recognised, or "transfer" — a
  // movement between own accounts (`categories` empty: the import route files it
  // under a transfer-type category).
  categorySource: "bank" | "fallback" | "transfer"
  bookingText: string
  sourceHash: string
}

// Raiffeisen XLSX exports have a header block in the first 11 rows
// Row 12 (index 11) is the actual column header row
const HEADER_ROW_INDEX = 11

// Counterparties that are always movements between own accounts in a Raiffeisen
// export. They're imported as transfers (left out of all totals), not dropped, so
// they stay visible and can be re-mapped. Other banks' and card issuers' names are
// the user's rules (→ a transfer-type category); pairs of opposite amounts across
// accounts are found on import without any name (src/lib/transfers.ts).
const INTERNAL_TRANSFER_PATTERNS = [
  /übertrag/i,
  /vorsorgekonto/i,
  /privatkonto/i,
  /sparkonto/i,
  /ihre zahlung - danke/i,
  // Monthly credit-card bill paid from checking. The individual purchases are
  // already imported from the VISA card account, so counting this lump
  // sum too would double-count card spending. (The annual "Gebühr/Jahresgebühr
  // Kreditkarte" fee does NOT match this and stays as a real expense.)
  /viseca card services/i,
]

// Map Raiffeisen's German category names to the default categories (prisma/seed.ts).
// A list is tried in order, for databases that predate a default's name.
const CATEGORY_MAP: Record<string, string | string[]> = {
  "lebensmittel":           "Groceries",
  "gastronomie":            "Dining & Bars",
  "shopping":               "Shopping",
  "unterhaltung":           "Entertainment",
  "öffentlicher verkehr":   "Transport",
  "auto":                   "Transport",
  "ärzte & pflegedienste":  "Healthcare",
  "krankenversicherung":    "Health Insurance",
  "persönliches":           "Personal",
  "miete & hypothek":       "Rent",
  "steuern":                "Taxes",
  "dienstleistungen":       "Personal",
  "möbel & einrichtung":    "Shopping",
  "sparen & anlegen":       "Savings Transfer",
  "lohn":                   ["Salary", "Income"],
  "weitere einnahmen":      ["Other Income", "Income"],
  "rückerstattungen":       ["Other Income", "Income"],
}

function isInternalTransfer(counterparty: string): boolean {
  return INTERNAL_TRANSFER_PATTERNS.some(pattern =>
    pattern.test(counterparty)
  )
}

// Used when the bank's category isn't in CATEGORY_MAP. Such transactions go to
// the review inbox, since "Personal" is only a guess for them.
export const FALLBACK_CATEGORY = "Personal"

// The default transfer-type category (prisma/seed.ts); created on import when a
// database has no transfer-type category yet.
export const TRANSFER_CATEGORY = "Internal Transfer"

// Merchant-specific categories (e.g. a telecom the bank files under
// "Persönliches") are the user's own rules on Data → Rules, not built in here.
function mapCategory(rawCategory: string): Pick<ParsedTransaction, "categories" | "categorySource"> {
  const mapped = CATEGORY_MAP[rawCategory.toLowerCase().trim()]
  return mapped
    ? { categories: [mapped].flat(), categorySource: "bank" }
    : { categories: [FALLBACK_CATEGORY], categorySource: "fallback" }
}

function generateHash(date: Date, counterparty: string, amount: number): string {
  const str = `${date.toISOString()}|${counterparty.trim()}|${amount}`
  // Simple hash — good enough for deduplication
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

export function parseRaiffeisenXLSX(buffer: Buffer): ParsedTransaction[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]

  // Convert to array of arrays starting from the header row
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    range: HEADER_ROW_INDEX,
  })

  // First row after range is the column headers, rest are data
  const [_headers, ...dataRows] = rows

  const transactions: ParsedTransaction[] = []

  for (const row of dataRows) {
    // Skip empty rows
    if (!row || !row[0]) continue

    const date        = row[0] as unknown as Date
    const rawCounterparty = String(row[1] ?? "").trim()
    const amount      = parseFloat(String(row[2] ?? "0"))
    const currency    = String(row[3] ?? "CHF").trim()
    const account     = String(row[4] ?? "").trim()
    const rawCategory = String(row[5] ?? "").trim()
    const bookingText = String(row[7] ?? "").trim()

    // Skip if missing critical fields
    if (!rawCounterparty || isNaN(amount) || !date) continue

    const counterparty = resolveCounterparty(rawCounterparty, bookingText)

    // Hashed on the counterparty as exported, so rows imported before
    // resolveCounterparty existed still deduplicate on re-import.
    const sourceHash = generateHash(date, rawCounterparty, amount)

    transactions.push({
      date: date instanceof Date ? date : new Date(date),
      counterparty,
      amount,
      currency,
      account,
      ...(isInternalTransfer(counterparty)
        ? { categories: [], categorySource: "transfer" as const }
        : mapCategory(rawCategory)),
      bookingText,
      sourceHash,
    })
  }

  return transactions
}