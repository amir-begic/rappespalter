import type { Locale } from "@/lib/i18n/locales"
import type { enCH } from "@/locales/en-CH"

// Every language provides exactly the keys English has (a missing or extra key is
// a type error), so a half-translated language can't ship.
export type Dict = Record<keyof typeof enCH, string>

// Messages with a count have one key per plural form ("x#one", "x#other"); the code
// asks for "x" and the right form is picked. (The "#" keeps ordinary keys like
// "kind.other" from being mistaken for a plural form.)
type PluralForm = "zero" | "one" | "two" | "few" | "many" | "other"
type Base<K> = K extends `${infer B}#${PluralForm}` ? B : K
export type MessageKey = Base<keyof typeof enCH>

// Only the language in use is loaded (the root layout hands it to the client).
export async function loadMessages(locale: Locale): Promise<Dict> {
  switch (locale) {
    case "de-CH": return (await import("@/locales/de-CH")).deCH
    case "fr-CH": return (await import("@/locales/fr-CH")).frCH
    case "it-CH": return (await import("@/locales/it-CH")).itCH
    default:      return (await import("@/locales/en-CH")).enCH
  }
}
