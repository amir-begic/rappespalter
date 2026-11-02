"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { isMotion, isTheme, saveAppearance, type Appearance } from "@/lib/appearance"

const MOTION_HINT: Record<Appearance["motion"], string> = {
  system: "Follows your system's “reduce motion” setting.",
  reduce: "No moving background shapes, wobbles or animated transitions.",
  full: "Everything moves, whatever the system setting.",
}

// Settings → Appearance: theme and motion, saved as soon as they're picked.
export function AppearanceCard() {
  const [appearance, setAppearance] = useState<Appearance | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/appearance")
      .then(r => r.json())
      .then(d => setAppearance(d.appearance))
      .catch(() => setError("Failed to load appearance"))
  }, [])

  async function change(next: Partial<Appearance>) {
    setError(null)
    setAppearance(prev => prev && { ...prev, ...next })
    try {
      setAppearance(await saveAppearance(next))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save appearance")
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Appearance</CardTitle>
      </CardHeader>
      <CardContent>
        {!appearance ? (
          <p className="text-xs text-muted-foreground">{error ?? "Loading…"}</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground mb-2">Theme</p>
              <Tabs value={appearance.theme} onValueChange={v => isTheme(v) && change({ theme: v })}>
                <TabsList>
                  <TabsTrigger value="light">Light</TabsTrigger>
                  <TabsTrigger value="dark">Dark</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Motion</p>
              <Tabs value={appearance.motion} onValueChange={v => isMotion(v) && change({ motion: v })}>
                <TabsList>
                  <TabsTrigger value="system">System</TabsTrigger>
                  <TabsTrigger value="reduce">Reduced</TabsTrigger>
                  <TabsTrigger value="full">Full</TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="text-[11px] text-muted-foreground mt-2">{MOTION_HINT[appearance.motion]}</p>
            </div>
            {error && <p className="text-xs text-destructive sm:col-span-2">{error}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
