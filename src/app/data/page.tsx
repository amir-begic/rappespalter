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

const fmt = (n: number) =>
  n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("de-CH", { day: "2-digit", month: "short", year: "2-digit" })

const fmtMonth = (d: string) =>
  new Date(d).toLocaleDateString("de-CH", { month: "long", year: "numeric" })

const typeColor: Record<string, string> = {
  fixed:    "#8ab4d4",
  variable: "#f0c080",
  savings:  "#6aaa7a",
}

// ────────────────────────────────────────────────────────────────────

export default function DataPage() {
  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <div className="mb-8">
        <p className="text-xs tracking-widest uppercase text-muted-foreground mb-2">
          Data
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Database Overview
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Browse every table and re-map transaction categories without a database browser.
        </p>
      </div>

      <Tabs defaultValue="transactions">
        <TabsList variant="line">
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="budgets">Budgets</TabsTrigger>
          <TabsTrigger value="snapshots">Snapshots</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="mt-6">
          <TransactionsTab />
        </TabsContent>
        <TabsContent value="categories" className="mt-6">
          <CategoriesTab />
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
  const [categories, setCategories] = useState<Category[]>([])
  const [months, setMonths]         = useState<string[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading]       = useState(true)

  // filters
  const [month, setMonth]       = useState("")     // "" = all months
  const [category, setCategory] = useState("")     // "" = all, "__uncategorized__" = none
  const [search, setSearch]     = useState("")
  const [page, setPage]         = useState(1)

  // per-row save state: id -> "saving" | "saved" | "error"
  const [rowStatus, setRowStatus] = useState<Record<number, string>>({})

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
      .finally(() => setLoading(false))
  }, [month, category, search, page])

  async function remap(tx: Transaction, newCategoryId: number | null) {
    const prevTransactions = transactions
    // optimistic update
    const newCat = categories.find(c => c.id === newCategoryId) ?? null
    setTransactions(ts => ts.map(t =>
      t.id === tx.id
        ? { ...t, categoryId: newCategoryId, category: newCat && { id: newCat.id, name: newCat.name, color: newCat.color } }
        : t
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
          className="text-sm border border-border rounded-md px-3 py-2 bg-background text-foreground"
        >
          <option value="">All months</option>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="text-sm border border-border rounded-md px-3 py-2 bg-background text-foreground"
        >
          <option value="">All categories</option>
          <option value="__uncategorized__">— Uncategorized —</option>
          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>

        <Input
          placeholder="Search counterparty…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />

        {pagination && (
          <span className="text-xs text-muted-foreground ml-auto">
            {pagination.total} transaction{pagination.total === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-sm text-muted-foreground py-20 justify-center">
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Loading...
        </div>
      ) : transactions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-20 text-center">
          No transactions match these filters.
        </p>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Date</TableHead>
                  <TableHead>Counterparty</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-56">Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map(tx => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtDate(tx.date)}
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <span className="block truncate">{tx.counterparty}</span>
                      <span className="block text-xs text-muted-foreground truncate">{tx.account}</span>
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
                          className="text-sm border border-border rounded-md px-2 py-1 bg-background text-foreground flex-1 min-w-0"
                        >
                          <option value="">— Uncategorized —</option>
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
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {pagination.page} of {pagination.pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.pages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Categories tab (overview) ──────────────────────────────────────

function CategoriesTab() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    fetch("/api/categories")
      .then(r => r.json())
      .then(d => setCategories(d.categories ?? []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Loading />
  if (categories.length === 0) return <Empty label="No categories yet." />

  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Transactions</TableHead>
              <TableHead className="text-right">Budget</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map(c => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: c.color }} />
                    {c.name}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" style={{ borderColor: typeColor[c.type] ?? "var(--border)" }}>
                    {c.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {c._count.transactions}
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {c.budget ? `Fr. ${fmt(c.budget.monthlyLimit)}` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ── Budgets tab (overview) ─────────────────────────────────────────

function BudgetsTab() {
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/budgets")
      .then(r => r.json())
      .then(d => setBudgets(d.budgets ?? []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Loading />
  if (budgets.length === 0) return <Empty label="No budgets set yet." />

  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Monthly limit</TableHead>
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
                <TableCell className="text-muted-foreground">{b.category.type}</TableCell>
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
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    fetch("/api/snapshots")
      .then(r => r.json())
      .then(d => setSnapshots(d.snapshots ?? []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Loading />
  if (snapshots.length === 0) return <Empty label="No snapshots recorded yet." />

  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">ETF</TableHead>
              <TableHead className="text-right">Savings</TableHead>
              <TableHead className="text-right">3a</TableHead>
              <TableHead className="text-right">2. Säule</TableHead>
              <TableHead className="text-right">Checking</TableHead>
              <TableHead className="text-right">Total</TableHead>
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
                <TableCell className="text-right font-mono font-semibold">Fr. {fmt(s.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ── Shared small states ────────────────────────────────────────────

function Loading() {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground py-20 justify-center">
      <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      Loading...
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground py-20 text-center">{label}</p>
}
