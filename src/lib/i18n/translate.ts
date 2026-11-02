import type { Locale } from "@/lib/i18n/locales"
import type { MessageKey } from "@/locales"

// Looks up and fills in a message. Pure, so it works on the server and the client.
//
//   t("goal.reached")                         plain text
//   t("goal.monthly", { amount: "1'200" })    {amount} is replaced
//   t("review.count", { count: 3 })           plural: uses "review.count#one" /
//                                             "#other" (the language's own plural
//                                             categories, "#other" as fallback)
//
// Messages that contain links or bold text use <tags>: see translateRich.

export type Vars = Record<string, string | number>
export type Messages = Record<string, string>

const rules = new Map<Locale, Intl.PluralRules>()
function pluralCategory(locale: Locale, count: number) {
  let r = rules.get(locale)
  if (!r) rules.set(locale, r = new Intl.PluralRules(locale))
  return r.select(count)
}

function pick(messages: Messages, locale: Locale, key: string, vars?: Vars): string {
  const count = vars?.count
  if (typeof count === "number") {
    const plural = messages[`${key}#${pluralCategory(locale, count)}`] ?? messages[`${key}#other`]
    if (plural != null) return plural
  }
  // A missing key shows the key itself — visible in the UI, caught by the type check.
  return messages[key] ?? key
}

const fill = (text: string, vars?: Vars) =>
  vars ? text.replace(/\{(\w+)\}/g, (whole, name) => name in vars ? String(vars[name]) : whole) : text

export function translate(messages: Messages, locale: Locale, key: MessageKey, vars?: Vars): string {
  return fill(pick(messages, locale, key, vars), vars)
}

/** A message with <tag>…</tag> parts, e.g. "Record one on <projections>Projections</projections>".
 *  `tags` maps each tag name to a function that wraps its text. */
export function translateRich<T>(
  messages: Messages, locale: Locale, key: MessageKey,
  tags: Record<string, (text: string) => T>, vars?: Vars,
): (string | T)[] {
  const text = fill(pick(messages, locale, key, vars), vars)
  const out: (string | T)[] = []
  const re = /<(\w+)>([\s\S]*?)<\/\1>/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const wrap = tags[m[1]]
    out.push(wrap ? wrap(m[2]) : m[2])
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
