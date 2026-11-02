"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n/provider"

// Marks a transaction as one-off (an inheritance, a car): it stays in totals but
// is left out of trends, averages and budget comparisons. Unless it's set, the
// button only shows on hover of the surrounding `group` (or keyboard focus).
export function OneOffToggle({ id, value, onChange }: {
  id:       number
  value:    boolean
  onChange: (value: boolean) => void
}) {
  const { t } = useT()
  const [busy, setBusy] = useState(false)

  async function toggle() {
    setBusy(true)
    try {
      const res = await fetch("/api/transactions", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id, oneOff: !value }),
      })
      if (res.ok) onChange(!value)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={value}
      title={t("oneoff.title")}
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide transition-opacity disabled:opacity-50",
        value
          ? "border-pop-yellow bg-pop-yellow/30 text-foreground"
          : "border-border text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100",
      )}
    >
      {value ? t("oneoff.on") : t("oneoff.mark")}
    </button>
  )
}
