"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { isMotion, isTheme, saveAppearance, type Appearance } from "@/lib/appearance"
import { LOCALES, LOCALE_NAMES, isLocale } from "@/lib/i18n/locales"
import { useSetLanguage, useT } from "@/lib/i18n/provider"
import type { MessageKey } from "@/locales"

const MOTION_HINT: Record<Appearance["motion"], MessageKey> = {
  system: "appearance.motionHint.system",
  reduce: "appearance.motionHint.reduce",
  full: "appearance.motionHint.full",
}

// Settings → Appearance: language, theme and motion, saved as soon as they're picked.
export function AppearanceCard() {
  const { t, locale } = useT()
  const setLanguage = useSetLanguage()
  const [appearance, setAppearance] = useState<Appearance | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/appearance")
      .then(r => r.json())
      .then(d => setAppearance(d.appearance))
      .catch(() => setError(t("appearance.loadFailed")))
    // Loads once; t is only read if loading fails.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function change(next: Partial<Appearance>) {
    setError(null)
    setAppearance(prev => prev && { ...prev, ...next })
    try {
      setAppearance(await saveAppearance(next))
    } catch (e) {
      setError(e instanceof Error ? e.message : t("appearance.saveFailed"))
    }
  }

  async function changeLanguage(next: string) {
    if (!isLocale(next)) return
    setError(null)
    try {
      await setLanguage(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("language.saveFailed"))
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>{t("appearance.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {!appearance ? (
          <p className="text-xs text-muted-foreground">{error ?? t("common.loading")}</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground mb-2">{t("language.title")}</p>
              <Tabs value={locale} onValueChange={changeLanguage}>
                <TabsList>
                  {LOCALES.map(l => <TabsTrigger key={l} value={l} lang={l}>{LOCALE_NAMES[l]}</TabsTrigger>)}
                </TabsList>
              </Tabs>
              <p className="text-[11px] text-muted-foreground mt-2">{t("language.hint")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">{t("appearance.theme")}</p>
              <Tabs value={appearance.theme} onValueChange={v => isTheme(v) && change({ theme: v })}>
                <TabsList>
                  <TabsTrigger value="light">{t("appearance.light")}</TabsTrigger>
                  <TabsTrigger value="dark">{t("appearance.dark")}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">{t("appearance.motion")}</p>
              <Tabs value={appearance.motion} onValueChange={v => isMotion(v) && change({ motion: v })}>
                <TabsList>
                  <TabsTrigger value="system">{t("appearance.system")}</TabsTrigger>
                  <TabsTrigger value="reduce">{t("appearance.reduced")}</TabsTrigger>
                  <TabsTrigger value="full">{t("appearance.full")}</TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="text-[11px] text-muted-foreground mt-2">{t(MOTION_HINT[appearance.motion])}</p>
            </div>
            {error && <p className="text-xs text-destructive sm:col-span-2">{error}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
