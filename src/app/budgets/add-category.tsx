"use client"

import { useState, type FormEvent } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useT } from "@/lib/i18n/provider"

interface NewCategory {
  id:     number
  name:   string
  color:  string
  type:   string
  budget: { monthlyLimit: number } | null
}

// A new expense category, with its budget if a limit is given. budgetSaved is false
// when the category was created but saving its limit failed.
export function AddCategory({ onAdded }: {
  onAdded: (category: NewCategory, limit: string, budgetSaved: boolean) => void
}) {
  const { t } = useT()
  const [open, setOpen]   = useState(false)
  const [name, setName]   = useState("")
  const [type, setType]   = useState("variable")
  const [limit, setLimit] = useState("")
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)

  function close() {
    setOpen(false)
    setName("")
    setType("variable")
    setLimit("")
    setError(null)
  }

  async function saveBudget(categoryId: number, monthlyLimit: number) {
    const res = await fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, monthlyLimit }),
    }).catch(() => null)
    return res?.ok ?? false
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "")

      const category = data.category as NewCategory
      const amount = limit.trim()
      const budgetSaved = amount !== "" && await saveBudget(category.id, Number(amount))
      onAdded({ ...category, budget: budgetSaved ? { monthlyLimit: Number(amount) } : null }, amount, budgetSaved)
      close()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("data.cat.addFailed"))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="mt-3" onClick={() => setOpen(true)}>
        <Plus />
        {t("data.cat.add")}
      </Button>
    )
  }

  return (
    <form onSubmit={add} className="mt-3 pt-3 border-t border-border">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-48">
          <label htmlFor="budget-category-name" className="text-xs text-muted-foreground mb-1 block">{t("data.cat.new")}</label>
          <Input
            id="budget-category-name" autoFocus placeholder={t("data.cat.newPlaceholder")}
            value={name} maxLength={40} onChange={e => setName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="budget-category-type" className="text-xs text-muted-foreground mb-1 block">{t("data.cat.type")}</label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger id="budget-category-type" className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="variable">{t("dashboard.type.variable")}</SelectItem>
              <SelectItem value="fixed">{t("dashboard.type.fixed")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor="budget-category-limit" className="text-xs text-muted-foreground mb-1 block">{t("budgets.addLimit")}</label>
          <Input
            id="budget-category-limit" type="number" min={0} step={10} placeholder="—"
            value={limit} onChange={e => setLimit(e.target.value)}
            className="w-44 text-right font-mono"
          />
        </div>
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? t("data.cat.adding") : t("data.cat.add")}
        </Button>
        <Button type="button" variant="ghost" onClick={close} disabled={busy}>
          {t("common.cancel")}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
    </form>
  )
}
