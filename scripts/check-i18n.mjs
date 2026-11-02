// Checks the translations against English beyond what TypeScript can: every
// language uses the same {placeholders} and <tags> as the English message, has the
// plural forms its language needs, and has no empty message.
//   pnpm i18n:check

import { enCH } from "../src/locales/en-CH.ts"
import { deCH } from "../src/locales/de-CH.ts"
import { frCH } from "../src/locales/fr-CH.ts"
import { itCH } from "../src/locales/it-CH.ts"

const languages = { "de-CH": deCH, "fr-CH": frCH, "it-CH": itCH }
const tokens = text => [
  ...[...text.matchAll(/\{(\w+)\}/g)].map(m => `{${m[1]}}`),
  ...[...text.matchAll(/<(\w+)>/g)].map(m => `<${m[1]}>`),
].sort().join(" ")

let problems = 0
const report = (lang, key, message) => { problems++; console.error(`${lang}  ${key}: ${message}`) }

for (const [lang, messages] of Object.entries(languages)) {
  const pluralForms = new Set(new Intl.PluralRules(lang).resolvedOptions().pluralCategories)
  for (const [key, english] of Object.entries(enCH)) {
    const text = messages[key]
    if (text == null) { report(lang, key, "missing"); continue }
    if (!text.trim()) report(lang, key, "empty")
    if (tokens(text) !== tokens(english)) report(lang, key, `placeholders/tags differ — English has [${tokens(english)}], this has [${tokens(text)}]`)
    const form = key.match(/#(zero|one|two|few|many|other)$/)?.[1]
    if (form && !pluralForms.has(form) && form !== "other") report(lang, key, `${lang} has no "${form}" plural form`)
  }
  for (const key of Object.keys(messages)) if (!(key in enCH)) report(lang, key, "not in English")
}

const count = Object.keys(enCH).length
if (problems) {
  console.error(`\n${problems} problem${problems === 1 ? "" : "s"}.`)
  process.exit(1)
}
console.log(`i18n: ${count} messages × ${Object.keys(languages).length} languages, all consistent.`)
