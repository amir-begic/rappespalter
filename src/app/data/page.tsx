"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table"
import { BUDGETABLE_TYPES, CATEGORY_TYPES, isCategoryType } from "@/lib/categories"
import { useT } from "@/lib/i18n/provider"
import { RulesTab } from "./rules-tab"
import { RuleSuggestion } from "@/components/rule-suggestion"
import { OneOffToggle } from "@/components/one-off-toggle"
import { PageLoading } from "@/components/page-loading"

// ── Types ──────────────────────────────────────────────────────────

interface Category {
  id:    number
  name:  string
  color: string
  type:  string
  budget: { monthlyLimit: number } | null
  _count: { transactions: number }
}

interface Transaction {
  id:           number
  date:         string
  counterparty: string
  amount:       number
  account:      string
  categoryId:   number | null
  category:     { id: number; name: string; color: string } | null
  mark:         { oneOff: boolean } | null
}

interface Pagination {
  total: number
  page:  number
  limit: number
  pages: number
}

interface Budget {
  id:           number
  monthlyLimit: number
  category:     { name: string; color: string; type: string }
}

interface Snapshot {
  id:       number
  month:    string
  etf:      number
  savings:  number
  pillar3a: number
  pillar2:  number
  checking: number
  total:    number
}

// ── Formatting helpers ─────────────────────────────────────────────

// Number and date writing in the current language.
function useFormats() {
  const { f } = useT()
  return {
    fmt: (n: number) => f.decimal(n),
    fmtDate: (d: string) => f.date(d, { day: "2-digit", month: "short", year: "2-digit" }),
    fmtMonth: (d: string) => f.date(d, { month: "long", year: "numeric" }),
  }
}

const typeColor: Record<string, string> = {
  fixed:    "#8ab4d4",
  variable: "#f0c080",
  savings:  "#6aaa7a",
  income:   "#4caf72",
  transfer: "#9999aa",
}

// ────────────────────────────────────────────────────────────────────

export default function DataPage() {
  const { t } = useT()
  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <div className="mb-8">
        <p className="text-xs uppercase text-muted-foreground mb-2">
          {t("nav.section.data")}
        </p>
        <h1>
          {t("data.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          {t("data.intro")}
        </p>
      </div>

      <Tabs defaultValue="transactions">
        <TabsList variant="line">
          <TabsTrigger value="transactions">{t("data.tab.transactions")}</TabsTrigger>
          <TabsTrigger value="categories">{t("data.tab.categories")}</TabsTrigger>
          <TabsTrigger value="rules">{t("data.tab.rules")}</TabsTrigger>
          <TabsTrigger value="budgets">{t("data.tab.budgets")}</TabsTrigger>
          <TabsTrigger value="snapshots">{t("data.tab.snapshots")}</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="mt-6">
          <TransactionsTab />
        </TabsContent>
        <TabsContent value="categories" className="mt-6">
          <CategoriesTab />
        </TabsContent>
        <TabsContent value="rules" className="mt-6">
          <RulesTab />
        </TabsContent>
        <TabsContent value="budgets" className="mt-6">
          <BudgetsTab />
        </TabsContent>
        <TabsContent value="snapshots" className="mt-6">
          <SnapshotsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── Transactions tab (the re-mapping editor) ───────────────────────

function TransactionsTab() {
  const { t } = useT()
  const { fmt, fmtDate } = useFormats()
  const [categories, setCategories] = useState<Category[]>([])
  const [months, setMonths]         = useState<string[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading]       = useState(true)
  const [loaded, setLoaded]         = useState(false) // the first results have arrived

  // filters
  const [month, setMonth]       = useState("")     // "" = all months
  const [category, setCategory] = useState("")     // "" = all, "__uncategorized__" = none
  const [search, setSearch]     = useState("")
  const [page, setPage]         = useState(1)

  // per-row save state: id -> "saving" | "saved" | "error"
  const [rowStatus, setRowStatus] = useState<Record<number, string>>({})
  // after a manual re-map: offer a rule so future imports get it right
  const [suggestion, setSuggestion] = useState<{ pattern: string; categoryId: number; amount: number } | null>(null)
  const [reloadKey, setReloadKey]   = useState(0)

  // load filter sources once
  useEffect(() => {
    fetch("/api/categories").then(r => r.json()).then(d => setCategories(d.categories ?? []))
    fetch("/api/months").then(r => r.json()).then(d => setMonths(d.months ?? []))
  }, [])

  // reset to first page whenever a filter changes
  useEffect(() => { setPage(1) }, [month, category, search])

  // load transactions on filter / page change
  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: "100" })
    if (month)    params.set("month", month)
    if (category) params.set("category", category)
    if (search)   params.set("search", search)

    fetch(`/api/transactions?${params.toString()}`)
      .then(r => r.json())
      .then(d => {
        setTransactions(d.transactions ?? [])
        setPagination(d.pagination ?? null)
      })
      .finally(() => { setLoading(false); setLoaded(true) })
  }, [month, category, search, page, reloadKey])

  async function remap(tx: Transaction, newCategoryId: number | null) {
    const prevTransactions = transactions
    // optimistic update
    const newCat = categories.find(c => c.id === newCategoryId) ?? null
    setTransactions(ts => ts.map(x =>
      x.id === tx.id
        ? { ...x, categoryId: newCategoryId, category: newCat && { id: newCat.id, name: newCat.name, color: newCat.color } }
        : x
    ))
    setRowStatus(s => ({ ...s, [tx.id]: "saving" }))

    try {
      const res = await fetch("/api/transactions", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: tx.id, categoryId: newCategoryId }),
      })
      if (!res.ok) throw new Error("save failed")
      setRowStatus(s => ({ ...s, [tx.id]: "saved" }))
      if (newCategoryId != null) setSuggestion({ pattern: tx.counterparty, categoryId: newCategoryId, amount: tx.amount })
      setTimeout(() => setRowStatus(s => {
        const rest = { ...s }
        delete rest[tx.id]
        return rest
      }), 1500)
    } catch {
      setTransactions(prevTransactions) // roll back
      setRowStatus(s => ({ ...s, [tx.id]: "error" }))
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="text-sm rounded-xl border border-input px-3 py-2 bg-card text-foreground"
        >
          <option value="">{t("data.tx.allMonths")}</option>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="text-sm rounded-xl border border-input px-3 py-2 bg-card text-foreground"
        >
          <option value="">{t("dashboard.drill.allCategories")}</option>
          <option value="__uncategorized__">{t("data.tx.uncategorizedOption")}</option>
          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>

        <Input
          placeholder={t("data.tx.search")}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />

        {pagination && (
          <span className="text-xs text-muted-foreground ml-auto">
            {t("data.tx.count", { count: pagination.total })}
          </span>
        )}
      </div>

      {suggestion && (
        <RuleSuggestion
          key={`${suggestion.pattern}:${suggestion.categoryId}`}
          suggestion={suggestion}
          categoryName={categories.find(c => c.id === suggestion.categoryId)?.name ?? t("review.thisCategory")}
          onDone={changed => { setSuggestion(null); if (changed) setReloadKey(k => k + 1) }}
        />
      )}

      {/* Changing a filter keeps the current rows on screen, dimmed, until the new
          ones arrive; the spinner is for the first load only. */}
      {!loaded ? (
        <PageLoading />
      ) : transactions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-20 text-center">
          {t("data.tx.noMatch")}
        </p>
      ) : (
        <Card className={`transition-opacity ${loading ? "opacity-60 delay-300" : ""}`} aria-busy={loading}>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">{t("dashboard.drill.date")}</TableHead>
                  <TableHead>{t("dashboard.drill.counterparty")}</TableHead>
                  <TableHead className="text-right">{t("dashboard.drill.amount")}</TableHead>
                  <TableHead className="w-56">{t("dashboard.drill.category")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map(tx => (
                  <TableRow key={tx.id} className="group">
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtDate(tx.date)}
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <span className="block truncate">{tx.counterparty}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{tx.account}</span>
                        <OneOffToggle
                          id={tx.id}
                          value={tx.mark?.oneOff ?? false}
                          onChange={oneOff => setTransactions(ts => ts.map(x =>
                            x.id === tx.id ? { ...x, mark: { ...x.mark, oneOff } } : x
                          ))}
                        />
                      </span>
                    </TableCell>
                    <TableCell className={`text-right font-mono ${tx.amount < 0 ? "text-negative" : "text-positive"}`}>
                      Fr. {fmt(tx.amount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-sm flex-shrink-0"
                          style={{ background: tx.category?.color ?? "transparent", border: tx.category ? "none" : "1px solid var(--border)" }}
                        />
                        <select
                          value={tx.categoryId ?? ""}
                          onChange={e => remap(tx, e.target.value === "" ? null : Number(e.target.value))}
                          className="text-sm rounded-xl border border-input px-2 py-1 bg-card text-foreground flex-1 min-w-0"
                        >
                          <option value="">{t("data.tx.uncategorizedOption")}</option>
                          {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        <span className="w-4 text-xs flex-shrink-0">
                          {rowStatus[tx.id] === "saving" && "…"}
                          {rowStatus[tx.id] === "saved"  && <span className="text-positive">✓</span>}
                          {rowStatus[tx.id] === "error"  && <span className="text-destructive">✕</span>}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {pagination && pagination.pages > 1 && (
              <div className="flex items-center justify-between pt-4 text-sm">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  {t("data.tx.previous")}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {t("data.tx.page", { page: pagination.page, pages: pagination.pages })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.pages}
                  onClick={() => setPage(p => p + 1)}
                >
                  {t("data.tx.next")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Categories tab (manage) ────────────────────────────────────────

const selectClass = "text-sm rounded-xl border border-input px-3 py-2 bg-card text-foreground"

// Native <select> of category types, grouped Expense / Income / Other.
function TypeSelect({ value, onChange, id, className = "" }: {
  value: string; onChange: (v: string) => void; id?: string; className?: string
}) {
  const { t } = useT()
  const groups = [...new Set(CATEGORY_TYPES.map(ct => ct.group))]
  return (
    <select id={id} value={value} onChange={e => onChange(e.target.value)} className={`${selectClass} ${className}`}>
      {groups.map(g => (
        <optgroup key={g} label={t(`ctype.group.${g}`)}>
          {CATEGORY_TYPES.filter(ct => ct.group === g).map(ct => (
            <option key={ct.value} value={ct.value}>{t(`ctype.${ct.value}.label`)}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

// A category type's name and hint in the current language.
function useTypeText() {
  const { t } = useT()
  return {
    typeLabel: (type: string) => isCategoryType(type) ? t(`ctype.${type}.label`) : type,
    typeHint:  (type: string) => isCategoryType(type) ? t(`ctype.${type}.hint`) : "",
  }
}

// Throws the server's message, or an empty one when it sent none (callers show a
// translated fallback).
async function sendCategory(method: "POST" | "PATCH" | "DELETE", body?: object, id?: number) {
  const res = await fetch(id != null ? `/api/categories?id=${id}` : "/api/categories", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body:    body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? "")
  return data as { category?: Category }
}

function CategoriesTab() {
  const { t } = useT()
  const { fmt } = useFormats()
  const { typeLabel, typeHint } = useTypeText()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading]       = useState(true)
  const [editingId, setEditingId]   = useState<number | null>(null)

  useEffect(() => {
    fetch("/api/categories")
      .then(r => r.json())
      .then(d => setCategories(d.categories ?? []))
      .finally(() => setLoading(false))
  }, [])

  const sorted = (list: Category[]) => [...list].sort((a, b) => a.name.localeCompare(b.name))

  if (loading) return <PageLoading />

  return (
    <div className="space-y-4">
      <AddCategory onAdded={c => setCategories(prev => sorted([...prev, c]))} />

      {categories.length === 0 ? <Empty label={t("data.cat.none")} /> : (
        <Card>
          <CardContent className="pt-6 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("dashboard.drill.category")}</TableHead>
                  <TableHead>{t("data.cat.type")}</TableHead>
                  <TableHead className="text-right">{t("data.cat.transactions")}</TableHead>
                  <TableHead className="text-right">{t("budgets.drift.budget")}</TableHead>
                  <TableHead className="w-36"><span className="sr-only">{t("data.cat.actions")}</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map(c => editingId === c.id ? (
                  <EditCategoryRow
                    key={c.id}
                    category={c}
                    onCancel={() => setEditingId(null)}
                    onSaved={updated => {
                      setCategories(prev => sorted(prev.map(x => x.id === updated.id ? updated : x)))
                      setEditingId(null)
                    }}
                  />
                ) : (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: c.color }} />
                        {c.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" title={typeHint(c.type)} style={{ borderColor: typeColor[c.type] ?? "var(--border)" }}>
                        {typeLabel(c.type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {c._count.transactions}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {c.budget ? `Fr. ${fmt(c.budget.monthlyLimit)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(c.id)}>{t("common.edit")}</Button>
                      <Button
                        size="sm" variant="ghost" className="text-destructive"
                        onClick={async () => {
                          const n = c._count.transactions
                          const msg = t("data.cat.deleteConfirm", { name: c.name }) +
                            (n ? `\n\n${t("data.cat.deleteTx", { count: n })}` : "") +
                            (c.budget ? `\n${t("data.cat.deleteBudget")}` : "")
                          if (!confirm(msg)) return
                          try {
                            await sendCategory("DELETE", undefined, c.id)
                            setCategories(prev => prev.filter(x => x.id !== c.id))
                          } catch (e) {
                            alert(e instanceof Error && e.message ? e.message : t("pf.deleteFailed"))
                          }
                        }}
                      >
                        {t("common.delete")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function AddCategory({ onAdded }: { onAdded: (c: Category) => void }) {
  const { t } = useT()
  const { typeHint } = useTypeText()
  const [name, setName]   = useState("")
  const [type, setType]   = useState("variable")
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { category } = await sendCategory("POST", { name, type })
      if (category) onAdded(category)
      setName("")
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("data.cat.addFailed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={add} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <label htmlFor="new-category-name" className="text-xs text-muted-foreground mb-1 block">{t("data.cat.new")}</label>
            <Input
              id="new-category-name" placeholder={t("data.cat.newPlaceholder")}
              value={name} maxLength={40} onChange={e => setName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="new-category-type" className="text-xs text-muted-foreground mb-1 block">{t("data.cat.type")}</label>
            <TypeSelect id="new-category-type" value={type} onChange={setType} />
          </div>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? t("data.cat.adding") : t("data.cat.add")}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-2">{typeHint(type)}</p>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </CardContent>
    </Card>
  )
}

function EditCategoryRow({ category, onSaved, onCancel }: {
  category: Category
  onSaved:  (c: Category) => void
  onCancel: () => void
}) {
  const { t } = useT()
  const [name, setName]   = useState(category.name)
  const [type, setType]   = useState(category.type)
  const [color, setColor] = useState(category.color)
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)

  const losesBudget = !!category.budget && BUDGETABLE_TYPES.has(category.type) && !BUDGETABLE_TYPES.has(type)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const { category: updated } = await sendCategory("PATCH", { id: category.id, name, type, color })
      if (updated) onSaved(updated)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("data.cat.saveFailed"))
      setBusy(false)
    }
  }

  return (
    <TableRow className="bg-muted/30">
      <TableCell colSpan={4}>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="color" aria-label={t("data.cat.colorAria")} value={color} onChange={e => setColor(e.target.value)}
            className="h-8 w-8 cursor-pointer rounded-lg border border-input bg-card p-0.5"
          />
          <Input
            aria-label={t("data.cat.nameAria")} value={name} maxLength={40} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel() }}
            className="w-48" autoFocus
          />
          <TypeSelect value={type} onChange={setType} />
        </div>
        {losesBudget && <p className="text-xs text-highlight mt-2">{t("data.cat.losesBudget")}</p>}
        {error && <p className="text-xs text-destructive mt-2">{error}</p>}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap align-top">
        <Button size="sm" onClick={save} disabled={busy || !name.trim()}>{t("common.save")}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>{t("common.cancel")}</Button>
      </TableCell>
    </TableRow>
  )
}

// ── Budgets tab (overview) ─────────────────────────────────────────

function BudgetsTab() {
  const { t } = useT()
  const { fmt } = useFormats()
  const { typeLabel } = useTypeText()
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/budgets")
      .then(r => r.json())
      .then(d => setBudgets(d.budgets ?? []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PageLoading />
  if (budgets.length === 0) return <Empty label={t("data.budgets.none")} />

  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("dashboard.drill.category")}</TableHead>
              <TableHead>{t("data.cat.type")}</TableHead>
              <TableHead className="text-right">{t("data.budgets.limit")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {budgets.map(b => (
              <TableRow key={b.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: b.category.color }} />
                    {b.category.name}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{typeLabel(b.category.type)}</TableCell>
                <TableCell className="text-right font-mono">Fr. {fmt(b.monthlyLimit)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ── Snapshots tab (overview) ───────────────────────────────────────

function SnapshotsTab() {
  const { t } = useT()
  const { fmt, fmtMonth } = useFormats()
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    fetch("/api/snapshots")
      .then(r => r.json())
      .then(d => setSnapshots(d.snapshots ?? []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PageLoading />
  if (snapshots.length === 0) return <Empty label={t("data.snapshots.none")} />

  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("proj.history.month")}</TableHead>
              <TableHead className="text-right">{t("networth.series.etf")}</TableHead>
              <TableHead className="text-right">{t("proj.history.savings")}</TableHead>
              <TableHead className="text-right">{t("proj.history.pillar3a")}</TableHead>
              <TableHead className="text-right">{t("account.pillar2")}</TableHead>
              <TableHead className="text-right">{t("networth.series.checking")}</TableHead>
              <TableHead className="text-right">{t("common.total")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshots.map(s => (
              <TableRow key={s.id}>
                <TableCell className="whitespace-nowrap">{fmtMonth(s.month)}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">{fmt(s.etf)}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">{fmt(s.savings)}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">{fmt(s.pillar3a)}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">{fmt(s.pillar2)}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">{fmt(s.checking)}</TableCell>
                <TableCell className="text-right font-mono">Fr. {fmt(s.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ── Shared small states ────────────────────────────────────────────


function Empty({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground py-20 text-center">{label}</p>
}
