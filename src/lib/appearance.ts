// Appearance preferences (Settings → Appearance and the nav's theme toggle). Kept in
// the Setting table, not localStorage: the desktop app serves the UI from a random
// port on each launch, so anything stored per origin would be forgotten.
// The root layout applies them as data-theme / data-motion on <html> (globals.css).

export const THEMES = ["light", "dark"] as const
export const MOTIONS = ["system", "reduce", "full"] as const

export type Theme = (typeof THEMES)[number]
export type Motion = (typeof MOTIONS)[number]
export type Appearance = { theme: Theme; motion: Motion }

export const DEFAULT_APPEARANCE: Appearance = { theme: "light", motion: "system" }

// Setting table keys.
export const APPEARANCE_KEYS = { theme: "appearance.theme", motion: "appearance.motion" } as const

export const isTheme = (v: unknown): v is Theme => THEMES.includes(v as Theme)
export const isMotion = (v: unknown): v is Motion => MOTIONS.includes(v as Motion)

// Whether motion should be reduced right now ("system" follows the OS setting).
// Browser only.
export function motionReduced(motion: string | undefined) {
  if (motion === "reduce") return true
  if (motion === "full") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

// Saves a change and applies it to the page straight away.
export async function saveAppearance(change: Partial<Appearance>) {
  const root = document.documentElement
  if (change.theme) root.dataset.theme = change.theme
  if (change.motion) root.dataset.motion = change.motion
  const res = await fetch("/api/appearance", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(change),
  })
  if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save appearance")
  return (await res.json()).appearance as Appearance
}
