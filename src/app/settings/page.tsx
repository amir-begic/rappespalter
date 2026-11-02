"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { UpdatesCard } from "@/components/updates-card"
import { AppearanceCard } from "@/components/appearance-card"
import { BackupCard } from "@/components/backup-card"
import { SETTING_FIELDS, type SettingKey, type Settings } from "@/lib/settings"

const GROUPS = [
  { id: "profile", title: "Profile",               hint: "Used as the starting age on the projection timeline." },
  { id: "monthly", title: "Monthly contributions", hint: "CHF added every month in the projection." },
  { id: "initial", title: "Opening balances",      hint: "CHF starting balances, used only until you record a snapshot on the Projections page." },
] as const

const fmtR = (n: number) => Math.round(n).toLocaleString("de-CH")

export default function SettingsPage() {
  const [values, setValues]     = useState<Record<SettingKey, string> | null>(null)
  const [defaults, setDefaults] = useState<Settings | null>(null)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState<string | null>(null)

  function apply(d: { settings: Settings; defaults: Settings }) {
    setDefaults(d.defaults)
    setValues(Object.fromEntries(
      SETTING_FIELDS.map(f => [f.key, String(d.settings[f.key])])
    ) as Record<SettingKey, string>)
  }

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(d => d.settings ? apply(d) : setError(d.error ?? "Failed to load settings"))
      .catch(() => setError("Failed to load settings"))
  }, [])

  function setValue(key: SettingKey, value: string) {
    setSaved(false)
    setValues(prev => prev && { ...prev, [key]: value })
  }

  async function save(reset = false) {
    if (!values) return
    const payload: Record<string, number | null> = {}
    for (const f of SETTING_FIELDS) {
      const n = Number(values[f.key])
      if (!reset && (values[f.key].trim() === "" || !Number.isFinite(n) || n < 0)) {
        setError(`${f.label}: enter a number ≥ 0`)
        return
      }
      payload[f.key] = reset ? null : n
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
      if (!res.ok) throw new Error(data.error ?? "Failed to save settings")
      apply(data)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">

      {/* Header */}
      <div className="mb-8">
        <p className="text-xs uppercase text-muted-foreground mb-2">
          Settings
        </p>
        <h1>
          Projection inputs
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Values saved here override the defaults from your environment.
        </p>
      </div>

      {!values || !defaults ? (
        error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <div className="flex items-center gap-3 text-sm text-muted-foreground py-20 justify-center">
            <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            Loading...
          </div>
        )
      ) : (
        <div className="space-y-4">
          {GROUPS.map(group => (
            <Card key={group.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  {group.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-4">{group.hint}</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {SETTING_FIELDS.filter(f => f.group === group.id).map(f => (
                    <div key={f.key}>
                      <label htmlFor={f.key} className="text-xs text-muted-foreground mb-1 block">
                        {f.label}
                      </label>
                      <Input
                        id={f.key}
                        type="number"
                        min={0}
                        value={values[f.key]}
                        onChange={e => setValue(f.key, e.target.value)}
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Default: {fmtR(defaults[f.key])}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="flex items-center gap-3">
            <Button onClick={() => save()} disabled={saving}>
              {saving ? "Saving..." : "Save settings"}
            </Button>
            <Button variant="outline" onClick={() => save(true)} disabled={saving}>
              Reset to defaults
            </Button>
            {saved && <span className="text-xs text-positive">✓ Saved</span>}
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
