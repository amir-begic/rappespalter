"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n/provider"

// Deletes one transaction (e.g. a duplicate). Shows on hover of the surrounding
// `group` like the one-off pill; the first click asks, a second one deletes.
export function DeleteTransactionButton({ id, onDeleted }: { id: number; onDeleted: () => void }) {
  const { t } = useT()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)

  // The question goes away again if it isn't answered.
  useEffect(() => {
    if (!asking) return
    const timer = setTimeout(() => setAsking(false), 4000)
    return () => clearTimeout(timer)
  }, [asking])

  async function click() {
    if (!asking) return setAsking(true)
    setBusy(true)
    try {
      const res = await fetch(`/api/transactions?id=${id}`, { method: "DELETE" })
      if (res.ok) onDeleted()
    } finally {
      setBusy(false)
      setAsking(false)
    }
  }

  return (
    <button
      type="button"
      onClick={click}
      disabled={busy}
      title={t("data.tx.deleteTitle")}
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide transition-opacity disabled:opacity-50",
        asking
          ? "border-destructive bg-destructive/10 text-destructive"
          : "border-border text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100",
      )}
    >
      {asking ? t("data.tx.deleteConfirm") : t("data.tx.delete")}
    </button>
  )
}
