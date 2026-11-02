import type { Locale } from "@/lib/i18n/locales"

// Numbers and dates in the language's Swiss locale. Money is always "Fr. 1'234"
// (the amount is a number, so it follows the locale's separators; the prefix
// stays, it's how Swiss francs are written in every language here).

export const fmtInt = (locale: Locale, n: number) => Math.round(n).toLocaleString(locale)

export const fmtDecimal = (locale: Locale, n: number, digits = 2) =>
  n.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })

export const fmtPercent = (locale: Locale, share: number, digits = 1) =>
  `${(share * 100).toLocaleString(locale, { maximumFractionDigits: digits })}%`

export const fmtDate = (locale: Locale, date: Date | string, options?: Intl.DateTimeFormatOptions) =>
  new Date(date).toLocaleDateString(locale, options)

/** "Sept. 26" from a YYYY-MM month. */
export function fmtMonthShort(locale: Locale, month: string) {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1).toLocaleDateString(locale, { month: "short", year: "2-digit" })
}

/** "September 2026" from a YYYY-MM month. */
export function fmtMonthLong(locale: Locale, month: string) {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1).toLocaleDateString(locale, { month: "long", year: "numeric" })
}

/** "A, B and C" in the language's own words. */
export const fmtList = (locale: Locale, items: string[]) =>
  new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(items)
