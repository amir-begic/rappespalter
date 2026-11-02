"use client"

import { Fragment, createContext, useCallback, useContext, useMemo, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import type { Locale } from "@/lib/i18n/locales"
import { translate, translateRich, type Messages, type Vars } from "@/lib/i18n/translate"
import { fmtDate, fmtDecimal, fmtInt, fmtList, fmtMonthLong, fmtMonthShort, fmtPercent } from "@/lib/i18n/format"
import type { MessageKey } from "@/locales"

// The root layout loads the current language's messages and hands them to this
// provider; client components read them with useT().

interface Value { locale: Locale; messages: Messages }
const I18nContext = createContext<Value | null>(null)

export function I18nProvider({ locale, messages, children }: Value & { children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error("useT must be used inside <I18nProvider>")
  return value
}

export const useLocale = () => useI18n().locale

/** t("key", { vars }) for the current language, plus number and date formatting
 *  in its Swiss locale. */
export function useT() {
  const { locale, messages } = useI18n()
  const t = useCallback((key: MessageKey, vars?: Vars) => translate(messages, locale, key, vars), [messages, locale])
  // A message with <tag>…</tag> parts: `tags` says what each tag turns into, e.g.
  //   rich("x.text", { link: text => <Link href="/y">{text}</Link>, b: text => <strong>{text}</strong> })
  const rich = useCallback(
    (key: MessageKey, tags: Record<string, (text: string) => ReactNode>, vars?: Vars) => (
      <>{translateRich<ReactNode>(messages, locale, key, tags, vars).map((part, i) => <Fragment key={i}>{part}</Fragment>)}</>
    ),
    [messages, locale],
  )
  const f = useMemo(() => ({
    int:        (n: number) => fmtInt(locale, n),
    decimal:    (n: number, digits?: number) => fmtDecimal(locale, n, digits),
    percent:    (share: number, digits?: number) => fmtPercent(locale, share, digits),
    date:       (d: Date | string, options?: Intl.DateTimeFormatOptions) => fmtDate(locale, d, options),
    monthShort: (month: string) => fmtMonthShort(locale, month),
    monthLong:  (month: string) => fmtMonthLong(locale, month),
    list:       (items: string[]) => fmtList(locale, items),
  }), [locale])
  return { t, rich, f, locale }
}

/** Saves the language and re-renders the page in it (messages come from the layout). */
export function useSetLanguage() {
  const router = useRouter()
  return useCallback(async (language: Locale) => {
    const res = await fetch("/api/language", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language }),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to save the language")
    router.refresh()
  }, [router])
}
