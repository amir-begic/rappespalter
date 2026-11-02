"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageLoading } from "@/components/page-loading"
import { RuleSuggestion } from "@/components/rule-suggestion"
import { OneOffToggle } from "@/components/one-off-toggle"

interface Category { id: number; name: string; color: string }

interface Transaction {
  id:           number
  date:         string
  counterparty: string
  amount:       number
  account:      string
  bookingText:  string | null
  categoryId:   number | null
  category:     Category | null
  mark:         { oneOff: boolean; categorySource: string | null } | null
}

// Transactions to the same counterparty are reviewed together.
interface Group {
  counterparty: string
  items:        Transaction[]
  total:        number
  latest:       string
  guessed:      Category | null // the parser's fallback category, if that's why it's here
}

const fmt = (n: number) =>
  n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("de-CH", { day: "2-digit", month: "short", year: "2-digit" })

function groupBy(transactions: Transaction[]): Group[] {
  const map = new Map<string, Group>()
  for (const t of transactions) {
    const g = map.get(t.counterparty) ?? { counterparty: t.counterparty, items: [], total: 0, latest: t.date, guessed: null }
    g.items.push(t)
    g.total += t.amount
    if (t.date > g.latest) g.latest = t.date
    if (t.categoryId != null && t.category) g.guessed = t.category
    map.set(t.counterparty, g)
  }
  return [...map.values()].sort((a, b) => b.latest.localeCompare(a.latest))
}

export default function ReviewPage() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null)
  const [categories, setCategories]     = useState<Category[]>([])
  const [recentSince, setRecentSince]   = useState<string>("")
  const [scope, setScope]               = useState<"recent" | "all">("recent")
  const [open, setOpen]                 = useState<string | null>(null)
  const [busy, setBusy]                 = useState<string | null>(null)
  const [error, setError]               = useState<string | null>(null)
  const [suggestion, setSuggestion]     = useState<{ pattern: string; categoryId: number; amount: number } | null>(null)

  function load() {
    Promise.all([
      fetch("/api/review").then(r => r.json()),
      fetch("/api/categories").then(r => r.json()),
    ])
      .then(([review, cats]) => {
        if (review.error) throw new Error(review.error)
        setTransactions(review.transactions)
        setRecentSince(review.recentSince)
        setCategories(cats.categories ?? [])
        // Nothing recent: start on everything, so the page isn't empty for no reason.
        if (!review.recent && review.total) setScope("all")
      })
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
  }
  useEffect(load, [])

  const remove = (ids: number[]) => setTransactions(ts => ts?.filter(t => !ids.includes(t.id)) ?? null)

  async function post(key: string, body: object) {
    setBusy(key)
    setError(null)
    try {
      const res = await fetch("/api/review", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save")
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save")
      return false
    } finally {
      setBusy(null)
    }
  }

  async function assign(g: Group, categoryId: number) {
    const ids = g.items.map(t => t.id)
    if (await post(g.counterparty, { ids, categoryId })) {
      remove(ids)
      setSuggestion({ pattern: g.counterparty, categoryId, amount: g.items[0].amount })
    }
  }

  async function confirm(g: Group) {
    const ids = g.items.map(t => t.id)
    if (await post(g.counterparty, { ids })) remove(ids)
  }

  // Clears what's on screen: the last 90 days, or everything under All.
  async function confirmShown() {
    const ids = inScope.map(t => t.id)
    if (!window.confirm(`Mark these ${ids.length} transactions as reviewed? They keep their current category.`)) return
    if (await post("__all__", { ids })) remove(ids)
  }

  const inScope = (transactions ?? []).filter(t => scope === "all" || t.date >= recentSince)
  const groups = groupBy(inScope)
  const recentCount = (transactions ?? []).filter(t => t.date >= recentSince).length

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">

      <div className="mb-8">
        <p className="text-xs uppercase text-muted-foreground mb-2">Data</p>
        <h1>Review</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Transactions nobody has checked the category of: uncategorized ones, and imports the bank
          filed under a category the app doesn&apos;t know, which got a guess. Pick a category for a
          counterparty, or confirm what&apos;s there.
        </p>
      </div>

      {!transactions && !error && <PageLoading />}
      {error && <div className="text-sm text-destructive py-4">{error}</div>}

      {transactions && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={scope} onValueChange={v => setScope(v as "recent" | "all")}>
              <TabsList>
                <TabsTrigger value="recent">Last 90 days ({recentCount})</TabsTrigger>
                <TabsTrigger value="all">All ({transactions.length})</TabsTrigger>
              </TabsList>
            </Tabs>
            {inScope.length > 0 && (
              <Button variant="outline" size="sm" className="ml-auto" disabled={!!busy} onClick={confirmShown}>
                Mark {inScope.length} as reviewed
              </Button>
            )}
          </div>

          {suggestion && (
            <RuleSuggestion
              key={`${suggestion.pattern}:${suggestion.categoryId}`}
              suggestion={suggestion}
              categoryName={categories.find(c => c.id === suggestion.categoryId)?.name ?? "this category"}
              onDone={changed => { setSuggestion(null); if (changed) load() }}
            />
          )}

          {groups.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center space-y-1">
                <p>Nothing to review</p>
                <p className="text-sm text-muted-foreground">
                  {transactions.length ? "Older items are under All." : "Every category has been checked."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 divide-y divide-border">
                {groups.map(g => (
                  <div key={g.counterparty} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        aria-expanded={open === g.counterparty}
                        onClick={() => setOpen(o => o === g.counterparty ? null : g.counterparty)}
                      >
                        <span className="block truncate">{g.counterparty}</span>
                        <span className="block text-xs text-muted-foreground">
                          {g.items.length === 1 ? fmtDate(g.latest) : `${g.items.length} payments · latest ${fmtDate(g.latest)}`}
                          {" · "}
                          {g.guessed ? <>guessed <strong className="font-medium">{g.guessed.name}</strong></> : "uncategorized"}
                        </span>
                      </button>
                      <span className={`font-mono text-sm ${g.total < 0 ? "text-negative" : "text-positive"}`}>
                        Fr. {fmt(g.total)}
                      </span>
                      <select
                        value=""
                        disabled={busy === g.counterparty}
                        onChange={e => e.target.value && assign(g, Number(e.target.value))}
                        aria-label={`Category for ${g.counterparty}`}
                        className="text-sm rounded-xl border border-input px-2 py-1 bg-card text-foreground w-44"
                      >
                        <option value="">Set category…</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <Button size="sm" variant="ghost" disabled={busy === g.counterparty} onClick={() => confirm(g)}>
                        Looks right
                      </Button>
                    </div>

                    {open === g.counterparty && (
                      <ul className="mt-3 space-y-1.5 border-l border-border pl-3">
                        {g.items.map(t => (
                          <li key={t.id} className="group flex items-center gap-3 text-xs">
                            <span className="w-20 shrink-0 text-muted-foreground">{fmtDate(t.date)}</span>
                            <span className="min-w-0 flex-1 truncate text-muted-foreground">
                              {t.bookingText?.split("\n").slice(1).join(" · ") || t.account}
                            </span>
                            <OneOffToggle
                              id={t.id}
                              value={t.mark?.oneOff ?? false}
                              onChange={oneOff => setTransactions(ts => ts?.map(x =>
                                x.id === t.id ? { ...x, mark: { categorySource: null, ...x.mark, oneOff } } : x
                              ) ?? null)}
                            />
                            <span className={`w-24 shrink-0 text-right font-mono ${t.amount < 0 ? "text-negative" : "text-positive"}`}>
                              Fr. {fmt(t.amount)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
