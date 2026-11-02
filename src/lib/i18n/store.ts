import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { ensureSettingTable } from "@/lib/setting-table"
import { DEFAULT_LOCALE, LANGUAGE_KEY, isLocale, matchLocale, type Locale } from "@/lib/i18n/locales"
import { translate, type Messages, type Vars } from "@/lib/i18n/translate"
import { loadMessages, type MessageKey } from "@/locales"

// The saved language, else the one the window asks for (Accept-Language: the
// desktop app's browser follows the operating system), else English. Read per
// request, never at build time. Never throws: the page must render.
export async function loadLocale(): Promise<{ locale: Locale; saved: boolean }> {
  try {
    await ensureSettingTable()
    const row = await prisma.setting.findUnique({ where: { key: LANGUAGE_KEY } })
    if (isLocale(row?.value)) return { locale: row.value, saved: true }
  } catch (error) {
    console.error("Language load error:", error)
  }
  try {
    return { locale: matchLocale((await headers()).get("accept-language")) ?? DEFAULT_LOCALE, saved: false }
  } catch {
    return { locale: DEFAULT_LOCALE, saved: false }
  }
}

export async function saveLocale(locale: Locale) {
  await ensureSettingTable()
  await prisma.setting.upsert({
    where: { key: LANGUAGE_KEY }, update: { value: locale }, create: { key: LANGUAGE_KEY, value: locale },
  })
}

/** A translator for server code (routes, server components) in the current language. */
export async function getT() {
  const { locale } = await loadLocale()
  const messages: Messages = await loadMessages(locale)
  return {
    locale,
    t: (key: MessageKey, vars?: Vars) => translate(messages, locale, key, vars),
  }
}
