// Languages the app is available in. The identifiers are the Swiss locales, so the
// same value picks both the translations and how numbers and dates are written
// (de-CH: 1'234.50 and 5.9.2026, fr-CH: 1 234,50 and 05.09.2026, it-CH, en-CH).
// English is the source language: every other language is checked against it.

export const LOCALES = ["en-CH", "de-CH", "fr-CH", "it-CH"] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "en-CH"

// Each language in its own words, for the picker.
export const LOCALE_NAMES: Record<Locale, string> = {
  "en-CH": "English",
  "de-CH": "Deutsch",
  "fr-CH": "Français",
  "it-CH": "Italiano",
}

export const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale)

// Setting table key.
export const LANGUAGE_KEY = "language"

/** The best supported language for an Accept-Language header (null: none fits).
 *  "de", "de-AT" and "de-DE" all give de-CH; the first listed language that we
 *  support wins, whatever its weight. */
export function matchLocale(acceptLanguage: string | null | undefined): Locale | null {
  if (!acceptLanguage) return null
  const wanted = acceptLanguage
    .split(",")
    .map(part => part.split(";")[0].trim().toLowerCase())
    .filter(Boolean)
  for (const tag of wanted) {
    const base = tag.split("-")[0]
    const found = LOCALES.find(l => l.toLowerCase() === tag) ?? LOCALES.find(l => l.split("-")[0] === base)
    if (found) return found
  }
  return null
}
