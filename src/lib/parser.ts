import * as XLSX from "xlsx"

export interface ParsedTransaction {
  date: Date
  counterparty: string
  amount: number
  currency: string
  account: string
  category: string
  bookingText: string
  sourceHash: string
}

// Raiffeisen XLSX exports have a header block in the first 11 rows
// Row 12 (index 11) is the actual column header row
const HEADER_ROW_INDEX = 11

// Internal transfers between your own accounts — skip these to avoid double counting
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

// Map Raiffeisen's German category names to your app's category names
const CATEGORY_MAP: Record<string, string> = {
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
  "lohn":                   "Income",
  "weitere einnahmen":      "Income",
  "rückerstattungen":       "Income",
}

// Merchant-specific overrides keyed on the counterparty. Raiffeisen often files
// these under a generic category (e.g. "Persönliches" → "Personal"), so a match
// here takes precedence over CATEGORY_MAP. Word boundaries avoid false hits
// (e.g. "Salt" the telecom vs. a "Saltimbocca" restaurant).
const COUNTERPARTY_OVERRIDES: { pattern: RegExp; category: string }[] = [
  { pattern: /\bwingo\b/i, category: "Internet" },
  { pattern: /\bsalt\b/i,  category: "Mobile" },
]

function isInternalTransfer(counterparty: string): boolean {
  return INTERNAL_TRANSFER_PATTERNS.some(pattern =>
    pattern.test(counterparty)
  )
}

function mapCategory(counterparty: string, rawCategory: string): string {
  const override = COUNTERPARTY_OVERRIDES.find(o => o.pattern.test(counterparty))
  if (override) return override.category

  const key = rawCategory.toLowerCase().trim()
  return CATEGORY_MAP[key] ?? "Personal"
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
    const counterparty = String(row[1] ?? "").trim()
    const amount      = parseFloat(String(row[2] ?? "0"))
    const currency    = String(row[3] ?? "CHF").trim()
    const account     = String(row[4] ?? "").trim()
    const rawCategory = String(row[5] ?? "").trim()
    const bookingText = String(row[7] ?? "").trim()

    // Skip if missing critical fields
    if (!counterparty || isNaN(amount) || !date) continue

    // Skip internal transfers — they'd be double counted
    if (isInternalTransfer(counterparty)) continue

    const sourceHash = generateHash(date, counterparty, amount)

    transactions.push({
      date: date instanceof Date ? date : new Date(date),
      counterparty,
      amount,
      currency,
      account,
      category: mapCategory(counterparty, rawCategory),
      bookingText,
      sourceHash,
    })
  }

  return transactions
}