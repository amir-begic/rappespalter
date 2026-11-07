"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { CategorySelect } from "@/components/category-select"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageLoading } from "@/components/page-loading"
import { RuleSuggestion } from "@/components/rule-suggestion"
import { OneOffToggle } from "@/components/one-off-toggle"
import { useT } from "@/lib/i18n/provider"
import { groupByPayee, splitLongTail, type PayeeGroup } from "@/lib/review-groups"

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

type Group = PayeeGroup<Transaction>

export default function ReviewPage() {
  const { t, rich, f } = useT()
  const fmt = (n: number) => f.decimal(n)
  const fmtDate = (d: string) => f.date(d, { day: "2-digit", month: "short", year: "2-digit" })
  const [transactions, setTransactions] = useState<Transaction[] | null>(null)
  const [categories, setCategories]     = useState<Category[]>([])
  const [recentSince, setRecentSince]   = useState<string>("")
  const [scope, setScope]               = useState<"recent" | "all">("recent")
  const [open, setOpen]                 = useState<string | null>(null)
  const [busy, setBusy]                 = useState<string | null>(null)
  const [error, setError]               = useState<string | null>(null)
  const [showTail, setShowTail]         = useState(false)
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
      .catch(e => setError(e instanceof Error ? e.message : t("review.loadFailed")))
  }
  // Loads once; `load` and t are only read here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [])

  const remove = (ids: number[]) => setTransactions(ts => ts?.filter(x => !ids.includes(x.id)) ?? null)

  async function post(key: string, body: object) {
    setBusy(key)
    setError(null)
    try {
      const res = await fetch("/api/review", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? t("common.saveFailed"))
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.saveFailed"))
      return false
    } finally {
      setBusy(null)
    }
  }

  async function assign(g: Group, categoryId: number) {
    const ids = g.items.map(x => x.id)
    if (await post(g.key, { ids, categoryId })) {
      remove(ids)
      setSuggestion({ pattern: g.counterparty, categoryId, amount: g.items[0].amount })
    }
  }

  async function confirm(g: Group) {
    const ids = g.items.map(x => x.id)
    if (await post(g.key, { ids })) remove(ids)
  }

  // Clears what's on screen: the last 90 days, or everything under All.
  async function confirmShown() {
    const ids = inScope.map(x => x.id)
    if (!window.confirm(t("review.confirmShown", { count: ids.length }))) return
    if (await post("__all__", { ids })) remove(ids)
  }

  // The suggestions from this payee's own history. Ones that only share a first word
  // with another payee are weaker, and are confirmed one group at a time.
  async function acceptSuggestions() {
    const ids = suggested.map(x => x.id)
    if (!window.confirm(t("review.confirmSuggestions", { count: ids.length }))) return
    if (await post("__all__", { ids })) remove(ids)
  }

  const inScope = (transactions ?? []).filter(x => scope === "all" || x.date >= recentSince)
  const groups = groupByPayee(inScope)
  const { main, tail } = splitLongTail(groups)
  const shownGroups = showTail ? groups : main
  const suggested = inScope.filter(x => x.mark?.categorySource === "suggested")
  const recentCount = (transactions ?? []).filter(x => x.date >= recentSince).length

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">

      <div className="mb-8">
        <p className="text-xs uppercase text-muted-foreground mb-2">{t("nav.section.data")}</p>
        <h1>{t("nav.page.review")}</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {t("review.intro")}
        </p>
      </div>

      {!transactions && !error && <PageLoading />}
      {error && <div className="text-sm text-destructive py-4">{error}</div>}

      {transactions && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={scope} onValueChange={v => setScope(v as "recent" | "all")}>
              <TabsList>
                <TabsTrigger value="recent">{t("review.scopeRecent", { count: recentCount })}</TabsTrigger>
                <TabsTrigger value="all">{t("review.scopeAll", { count: transactions.length })}</TabsTrigger>
              </TabsList>
            </Tabs>
            {inScope.length > 0 && (
              <div className="ml-auto flex flex-wrap gap-2">
                {suggested.length > 0 && (
                  <Button size="sm" disabled={!!busy} onClick={acceptSuggestions}>
                    {t("review.acceptSuggestions", { count: suggested.length })}
                  </Button>
                )}
                <Button variant="outline" size="sm" disabled={!!busy} onClick={confirmShown}>
                  {t("review.markShown", { count: inScope.length })}
                </Button>
              </div>
            )}
          </div>

          {suggestion && (
            <RuleSuggestion
              key={`${suggestion.pattern}:${suggestion.categoryId}`}
              suggestion={suggestion}
              categoryName={categories.find(c => c.id === suggestion.categoryId)?.name ?? t("review.thisCategory")}
              onDone={changed => { setSuggestion(null); if (changed) load() }}
            />
          )}

          {groups.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center space-y-1">
                <p>{t("review.nothing")}</p>
                <p className="text-sm text-muted-foreground">
                  {transactions.length ? t("review.olderUnderAll") : t("review.allChecked")}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 divide-y divide-border">
                {shownGroups.map(g => (
                  <div key={g.key} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        aria-expanded={open === g.key}
                        onClick={() => setOpen(o => o === g.key ? null : g.key)}
                      >
                        <span className="block truncate">{g.counterparty}</span>
                        <span className="block text-xs text-muted-foreground">
                          {g.items.length === 1 ? fmtDate(g.latest) : t("review.payments", { count: g.items.length, date: fmtDate(g.latest) })}
                          {" · "}
                          {g.guessed
                            ? rich(
                                g.source === "suggested" ? "review.suggested"
                                  : g.source === "suggested-brand" ? "review.suggestedBrand"
                                  : g.source === "suggested-list" ? "review.suggestedList"
                                  : g.source === "suggested-rhythm" ? "review.suggestedRhythm"
                                  : "review.guessed",
                                { b: text => <strong className="font-medium">{text}</strong> },
                                { name: g.guessed.name },
                              )
                            : t("review.uncategorized")}
                        </span>
                      </button>
                      <span className={`font-mono text-sm ${g.total < 0 ? "text-negative" : "text-positive"}`}>
                        Fr. {fmt(g.total)}
                      </span>
                      <CategorySelect
                        guessed={g.guessed}
                        categories={categories}
                        disabled={busy === g.key}
                        label={t("review.categoryFor", { name: g.counterparty })}
                        placeholder={t("review.setCategory")}
                        onChange={id => assign(g, id)}
                      />
                      <Button size="sm" variant={g.guessed ? "default" : "ghost"} disabled={busy === g.key} onClick={() => confirm(g)}>
                        {t("review.looksRight")}
                      </Button>
                    </div>

                    {open === g.key && (
                      <ul className="mt-3 space-y-1.5 border-l border-border pl-3">
                        {g.items.map(tx => (
                          <li key={tx.id} className="group flex items-center gap-3 text-xs">
                            <span className="w-20 shrink-0 text-muted-foreground">{fmtDate(tx.date)}</span>
                            <span className="min-w-0 flex-1 truncate text-muted-foreground">
                              {tx.bookingText?.split("\n").slice(1).join(" · ") || tx.account}
                            </span>
                            <OneOffToggle
                              id={tx.id}
                              value={tx.mark?.oneOff ?? false}
                              onChange={oneOff => setTransactions(ts => ts?.map(x =>
                                x.id === tx.id ? { ...x, mark: { categorySource: null, ...x.mark, oneOff } } : x
                              ) ?? null)}
                            />
                            <span className={`w-24 shrink-0 text-right font-mono ${tx.amount < 0 ? "text-negative" : "text-positive"}`}>
                              Fr. {fmt(tx.amount)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
                {tail.length > 0 && (
                  <div className="pt-3">
                    <Button size="sm" variant="ghost" aria-expanded={showTail} onClick={() => setShowTail(s => !s)}>
                      {showTail ? t("review.hideTail") : t("review.showTail", { count: tail.length })}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
