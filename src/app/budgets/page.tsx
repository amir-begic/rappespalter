"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { BUDGETABLE_TYPES as BUDGETABLE } from "@/lib/categories"
import { AddCategory } from "./add-category"
import { BudgetDrift } from "./drift"
import { PageLoading } from "@/components/page-loading"
import { useT } from "@/lib/i18n/provider"

interface Category {
  id:     number
  name:   string
  color:  string
  type:   string
  budget: { monthlyLimit: number } | null
}

const byTypeAndName = (a: Category, b: Category) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)

export default function BudgetsPage() {
  const { t, f } = useT()
  const [cats, setCats]       = useState<Category[] | null>(null)
  const [limits, setLimits]   = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [saved, setSaved]     = useState(false)
  const [version, setVersion] = useState(0) // bumped after saving, so the drift view reloads

  function load() {
    setLoading(true)
    fetch("/api/categories")
      .then(r => r.json())
      .then(d => {
        const list: Category[] = (d.categories ?? []).filter((c: Category) => BUDGETABLE.has(c.type))
        list.sort(byTypeAndName)
        setCats(list)
        setLimits(Object.fromEntries(list.map(c => [c.id, c.budget ? String(c.budget.monthlyLimit) : ""])))
      })
      .catch(() => setError(t("budgets.loadFailed")))
      .finally(() => setLoading(false))
  }

  // Loads once; `load` and t are only read here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [])

  function setLimit(id: number, value: string) {
    setSaved(false)
    setLimits(prev => ({ ...prev, [id]: value }))
  }

  // Added in place, not reloaded: that would lose limits typed but not saved yet.
  function added(category: Category, limit: string, budgetSaved: boolean) {
    setCats(prev => [...(prev ?? []), category].sort(byTypeAndName))
    setLimits(prev => ({ ...prev, [category.id]: limit }))
    setSaved(false)
    if (budgetSaved) setVersion(v => v + 1)
    else if (limit) setError(t("common.saveFailed"))
  }

  async function save() {
    if (!cats) return
    setSaving(true)
    setError(null)
    try {
      // Categories with a numeric value → upsert. Categories cleared but that
      // previously had a budget → delete.
      const toSet = cats
        .filter(c => limits[c.id]?.trim() !== "" && Number.isFinite(Number(limits[c.id])))
        .map(c => ({ categoryId: c.id, monthlyLimit: Number(limits[c.id]) }))

      const toDelete = cats.filter(c => (limits[c.id]?.trim() ?? "") === "" && c.budget !== null)

      if (toSet.length) {
        const res = await fetch("/api/budgets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ budgets: toSet }),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? t("common.saveFailed"))
      }

      await Promise.all(
        toDelete.map(c => fetch(`/api/budgets?categoryId=${c.id}`, { method: "DELETE" }))
      )

      setSaved(true)
      setVersion(v => v + 1)
      load() // refresh from server so budget/null state is accurate
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  const total = cats
    ? cats.reduce((s, c) => s + (Number(limits[c.id]) || 0), 0)
    : 0

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">

      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase text-muted-foreground mb-2">{t("budgets.label")}</p>
          <h1>{t("budgets.title")}</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {t("budgets.intro")}
          </p>
        </div>
        <Button onClick={save} disabled={saving || loading}>
          {saving ? t("common.saving") : t("budgets.save")}
        </Button>
      </div>

      {loading && !cats && <PageLoading />}

      {error && <div className="text-sm text-destructive py-4 text-center">{error}</div>}
      {saved && <div className="text-sm text-positive py-2">{t("budgets.saved")}</div>}

      <div className="mb-4">
        <BudgetDrift version={version} onUseAverage={(id, amount) => setLimit(id, String(amount))} />
      </div>

      {cats && (
        <Card className={`transition-opacity ${loading ? "opacity-60 delay-300" : ""}`} aria-busy={loading}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-muted-foreground">
                {t("budgets.categories", { count: cats.length })}
              </CardTitle>
              <span className="text-sm font-mono">{t("budgets.total", { amount: f.int(total) })}</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {cats.map(c => (
                <div key={c.id} className="flex items-center gap-3 py-2.5">
                  <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: c.color }} />
                  <span className="flex-1 text-sm">{c.name}</span>
                  <span className="text-xs uppercase text-muted-foreground w-20">{c.type === "fixed" ? t("dashboard.type.fixed") : t("dashboard.type.variable")}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Fr.</span>
                    <Input
                      type="number"
                      min={0}
                      step={10}
                      placeholder="—"
                      value={limits[c.id] ?? ""}
                      onChange={e => setLimit(c.id, e.target.value)}
                      className="h-8 w-28 text-right font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>
            <AddCategory onAdded={added} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
