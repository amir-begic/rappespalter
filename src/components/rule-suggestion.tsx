"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { createRule } from "@/app/data/rules-tab"
import { useT } from "@/lib/i18n/provider"

// Offered after a manual re-map: turn it into a rule for this counterparty.
export function RuleSuggestion({ suggestion, categoryName, onDone }: {
  suggestion:   { pattern: string; categoryId: number; amount: number }
  categoryName: string
  onDone:       (changed: boolean) => void
}) {
  const { t, rich } = useT()
  const [pattern, setPattern] = useState(suggestion.pattern)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function create(apply: boolean) {
    setBusy(true)
    setError(null)
    try {
      const { applied } = await createRule({ pattern, categoryId: suggestion.categoryId, apply })
      onDone(applied > 0)
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("rule.suggest.failed"))
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-info/40 bg-info/10 px-4 py-3 text-sm space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span>{t("rule.suggest.before")}</span>
        <Input aria-label={t("rule.suggest.textAria")} value={pattern} onChange={e => setPattern(e.target.value)} className="h-7 w-56" />
        <span>{rich("rule.suggest.after", { b: text => <strong>{text}</strong> }, { category: categoryName })}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || pattern.trim().length < 2} onClick={() => create(true)}>{t("rule.suggest.createApply")}</Button>
        <Button size="sm" variant="outline" disabled={busy || pattern.trim().length < 2} onClick={() => create(false)}>{t("rule.suggest.futureOnly")}</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDone(false)}>{t("rule.suggest.notNow")}</Button>
        <span className="text-xs text-muted-foreground">{t("rule.suggest.hint")}</span>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
