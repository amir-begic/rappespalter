"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { UpdatesCard } from "@/components/updates-card"
import { AppearanceCard } from "@/components/appearance-card"
import { BackupCard } from "@/components/backup-card"
import { SETTING_FIELDS, ageOn, type SettingKey, type Settings } from "@/lib/settings"
import { PageLoading } from "@/components/page-loading"
import { useT } from "@/lib/i18n/provider"
import type { MessageKey } from "@/locales"

const GROUPS = [
  { id: "monthly", title: "settings.group.monthly", hint: "settings.group.monthlyHint" },
  { id: "initial", title: "settings.group.initial", hint: "settings.group.initialHint" },
] as const

const FIELD_LABELS: Record<SettingKey, MessageKey> = {
  monthlyEtf:     "settings.field.monthlyEtf",
  monthly3a:      "settings.field.monthly3a",
  monthlyPillar2: "settings.field.monthlyPillar2",
  initEtf:        "settings.field.initEtf",
  initSavings:    "settings.field.initSavings",
  initPillar3a:   "settings.field.initPillar3a",
  initPillar2:    "settings.field.initPillar2",
}

export default function SettingsPage() {
  const router = useRouter()
  const { t, f: fmt } = useT()
  const [values, setValues]     = useState<Record<SettingKey, string> | null>(null)
  const [birthDate, setBirthDate] = useState("")
  const [estimated, setEstimated] = useState(false) // birth date guessed from the old age setting
  const [defaults, setDefaults] = useState<Settings | null>(null)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState<string | null>(null)

  function apply(d: { settings: Settings; defaults: Settings; birthDateEstimated: boolean }) {
    setDefaults(d.defaults)
    setBirthDate(d.settings.birthDate ?? "")
    setEstimated(d.birthDateEstimated)
    setValues(Object.fromEntries(
      SETTING_FIELDS.map(f => [f.key, String(d.settings[f.key])])
    ) as Record<SettingKey, string>)
  }

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(d => d.settings ? apply(d) : setError(d.error ?? t("settings.loadFailed")))
      .catch(() => setError(t("settings.loadFailed")))
    // Loads once; t is only read if loading fails.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setValue(key: SettingKey, value: string) {
    setSaved(false)
    setValues(prev => prev && { ...prev, [key]: value })
  }

  async function save(reset = false) {
    if (!values) return
    const payload: Record<string, number | string | null> = {}
    for (const f of SETTING_FIELDS) {
      const n = Number(values[f.key])
      if (!reset && (values[f.key].trim() === "" || !Number.isFinite(n) || n < 0)) {
        setError(t("settings.numberError", { field: t(FIELD_LABELS[f.key]) }))
        return
      }
      payload[f.key] = reset ? null : n
    }
    if (reset) payload.birthDate = null
    else if (birthDate && !estimated) payload.birthDate = birthDate
    else if (!birthDate) {
      setError(t("settings.birthDateError"))
      return
    }

    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res  = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: payload }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t("settings.saveFailed"))
      apply(data)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("settings.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  // Walk through the first-start setup again (it keeps what's already entered).
  async function rerunSetup() {
    await fetch("/api/onboarding", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: "started", step: 0 }),
    })
    router.push("/welcome")
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">

      {/* Header */}
      <div className="mb-8">
        <p className="text-xs uppercase text-muted-foreground mb-2">
          {t("settings.label")}
        </p>
        <h1>
          {t("settings.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          {t("settings.intro")}{" "}
          <button type="button" onClick={rerunSetup} className="underline hover:text-foreground">{t("settings.rerunSetup")}</button>
        </p>
      </div>

      {!values || !defaults ? (
        error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <PageLoading />
        )
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{t("settings.profile")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-4">
                {t("settings.profileText")}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label htmlFor="birthDate" className="text-xs text-muted-foreground mb-1 block">{t("settings.birthDate")}</label>
                  <Input
                    id="birthDate"
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={birthDate}
                    onChange={e => { setSaved(false); setEstimated(false); setBirthDate(e.target.value) }}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {birthDate ? t("settings.age", { age: ageOn(birthDate) }) : t("settings.notSet")}
                  </p>
                </div>
              </div>
              {estimated && (
                <p className="text-xs text-negative mt-3">
                  {t("settings.estimated")}
                </p>
              )}
            </CardContent>
          </Card>

          {GROUPS.map(group => (
            <Card key={group.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  {t(group.title)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-4">{t(group.hint)}</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {SETTING_FIELDS.filter(f => f.group === group.id).map(f => (
                    <div key={f.key}>
                      <label htmlFor={f.key} className="text-xs text-muted-foreground mb-1 block">
                        {t(FIELD_LABELS[f.key])}
                      </label>
                      <Input
                        id={f.key}
                        type="number"
                        min={0}
                        value={values[f.key]}
                        onChange={e => setValue(f.key, e.target.value)}
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {t("settings.default", { amount: fmt.int(defaults[f.key]) })}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="flex items-center gap-3">
            <Button onClick={() => save()} disabled={saving}>
              {saving ? t("settings.saving") : t("settings.save")}
            </Button>
            <Button variant="outline" onClick={() => save(true)} disabled={saving}>
              {t("settings.reset")}
            </Button>
            {saved && <span className="text-xs text-positive">{t("settings.saved")}</span>}
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
        </div>
      )}

      <div className="mt-10 space-y-4">
        <AppearanceCard />
        <BackupCard />
        <UpdatesCard />
      </div>
    </div>
  )
}
