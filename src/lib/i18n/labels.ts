import type { MessageKey } from "@/locales"

// Translation keys for names the pure libs define in English (src/lib/*.ts keep
// the identifiers; the words come from here, so they follow the language).

// The five snapshot accounts (goals.ts AssetKey, Net Worth, Tax).
export const ACCOUNT_LABEL = {
  checking: "account.checking",
  savings:  "account.savings",
  etf:      "account.etf",
  pillar3a: "account.pillar3a",
  pillar2:  "account.pillar2",
} as const satisfies Record<string, MessageKey>

// Collections (assets.ts COLLECTIBLE_TYPES) are stored by their English name — it
// also picks the illustration — and shown in the language in use.
export const COLLECTION_LABEL: Record<string, MessageKey> = {
  "Pokémon cards":  "as.collection.pokemon",
  "Trading cards":  "as.collection.trading",
  "Stamps & coins": "as.collection.stamps",
  "Watches":        "as.collection.watches",
  "Art":            "as.collection.art",
  "Sneakers":       "as.collection.sneakers",
  "Wine":           "as.collection.wine",
  "LEGO":           "as.collection.lego",
  "Other":          "as.collection.other",
}

// A portfolio warning (engine.ts) in the language in use.
import type { PortfolioWarning } from "@/lib/portfolio/engine"
import type { Vars } from "@/lib/i18n/translate"
export function warningText(t: (key: MessageKey, vars?: Vars) => string, w: PortfolioWarning): string {
  switch (w.code) {
    case "noFx":               return t("pfwarn.noFx", { currency: w.currency })
    case "noMarketPriceNamed": return t("pfwarn.noMarketPriceNamed", { name: w.name })
    case "noMarketPrice":      return t("pfwarn.noMarketPrice")
  }
}
