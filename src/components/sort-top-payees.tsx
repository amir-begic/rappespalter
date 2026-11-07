"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { CategorySelect } from "@/components/category-select"
import { Button } from "@/components/ui/button"
import { PageLoading } from "@/components/page-loading"
import { groupByPayee, groupsToCover, splitLongTail, type PayeeGroup } from "@/lib/review-groups"
import { useT } from "@/lib/i18n/provider"

interface Category { id: number; name: string; color: string }
interface Transaction {
  id:           number
  date:         string
  counterparty: string
  amount:       number
  categoryId:   number | null
  category:     Category | null
  mark:         { categorySource: string | null } | null
}

// "Show more" adds this many payees. The rest wait in Data → Review.
const MORE = 20

// First-start setup: a short list instead of the whole inbox, with how much of it is done.
export function SortTopPayees() {
  const { t, rich } = useT()
  const [groups, setGroups]         = useState<PayeeGroup<Transaction>[] | null>(null)
  const [total, setTotal]           = useState(0)
  const [sorted, setSorted]         = useState(0)
  const [categories, setCategories] = useState<Category[]>([])
  const [busy, setBusy]             = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [limit, setLimit]           = useState<number | null>(null) // set once loaded

  useEffect(() => {
    Promise.all([fetch("/api/review").then(r => r.json()), fetch("/api/categories").then(r => r.json())])
      .then(([review, cats]) => {
        if (review.error) throw new Error(review.error)
        const loaded = groupByPayee<Transaction>(review.transactions)
        setGroups(loaded)
        setLimit(groupsToCover(splitLongTail(loaded).main))
        setTotal(review.transactions.length)
        setCategories(cats.categories ?? [])
      })
      .catch(() => setError(t("review.loadFailed")))
    // Loads once; t is only read if loading fails.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function file(g: PayeeGroup<Transaction>, categoryId?: number) {
    setBusy(g.key)
    setError(null)
    try {
      const ids = g.items.map(x => x.id)
      const res = await fetch("/api/review", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(categoryId === undefined ? { ids } : { ids, categoryId }),
      })
      if (!res.ok) throw new Error()
      setGroups(gs => gs?.filter(x => x.key !== g.key) ?? null)
      setLimit(n => n == null ? n : n - 1) // the next payee doesn't move up into view
      setSorted(n => n + ids.length)
    } catch {
      setError(t("common.saveFailed"))
    } finally {
      setBusy(null)
    }
  }

  if (!groups) return error ? <p className="text-sm text-destructive">{error}</p> : <PageLoading />
  if (total === 0) return <p className="text-sm text-muted-foreground">{t("welcome.sort.nothing")}</p>

  const main = splitLongTail(groups).main
  const shown = main.slice(0, limit ?? 0)
  return (
    <div className="space-y-4">
      <p className="text-sm" role="status">{t("welcome.sort.progress", { percent: Math.round(100 * sorted / total) })}</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {shown.length > 0 && (
        <Card>
          <CardContent className="pt-6 divide-y divide-border">
            {shown.map(g => (
              <div key={g.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <span className="block truncate">{g.counterparty}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t("welcome.sort.payments", { count: g.items.length })}
                    {g.guessed && <> · {rich("review.guessed", { b: text => <strong className="font-medium">{text}</strong> }, { name: g.guessed.name })}</>}
                  </span>
                </div>
                <CategorySelect
                  guessed={g.guessed}
                  categories={categories}
                  disabled={busy === g.key}
                  label={t("review.categoryFor", { name: g.counterparty })}
                  placeholder={t("review.setCategory")}
                  onChange={id => file(g, id)}
                />
                {g.guessed && (
                  <Button size="sm" disabled={busy === g.key} onClick={() => file(g)}>
                    {t("review.looksRight")}
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {main.length > shown.length && (
        <Button variant="outline" size="sm" onClick={() => setLimit(shown.length + MORE)}>
          {t("welcome.sort.showMore", { count: Math.min(MORE, main.length - shown.length) })}
        </Button>
      )}
      {groups.length > shown.length && (
        <p className="text-xs text-muted-foreground">{t("welcome.sort.more", { count: groups.length - shown.length })}</p>
      )}
    </div>
  )
}
