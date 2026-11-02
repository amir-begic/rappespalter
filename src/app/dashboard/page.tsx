"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { SpendingPace } from "./pace"
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts"

interface Summary {
  month: string
  summary: {
    income:   number
    expenses: number
    saved:       number
    savingsRate: number
    net:      number
  }
  byCategory: {
    categoryName: string
    color:        string
    type:         string
    actual:       number
    budget:       number | null
  }[]
  bySavings: {
    categoryName: string
    color:        string
    actual:       number
  }[]
  byType: {
    fixed:    number
    variable: number
    savings:  number
  }
  flags: {
    categoryName: string
    color:        string
    actual:       number
    budget:       number
    delta:        number
    status:       "over" | "under"
  }[]
  budgetTotals: {
    budget: number
    actual: number
  }
  topExpenses: {
    id:           number
    date:         string
    counterparty: string
    amount:       number
    category:     string
    color:        string
  }[]
  savingsTransactions: {
  id:           number
  date:         string
  counterparty: string
  amount:       number
  category:     string
  color:        string
}[]
}


const fmt = (n: number) =>
  n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtR = (n: number) =>
  Math.round(n).toLocaleString("de-CH")

interface Txn {
  id:           number
  date:         string
  counterparty: string
  amount:       number
  account:      string
  bookingText:  string | null
  category:     { name: string; color: string; type: string } | null
}

// The four stat cards drill into the month's transactions. Each predicate
// mirrors exactly how /api/summary computes that total, so the dialog total
// always matches the card. ("transfer" rows are internal account movements.)
type DrillKind = "income" | "expenses" | "saved" | "net"

const DRILL: Record<DrillKind, {
  title:     string
  color:     string                       // accent for amounts of this kind
  predicate: (t: Txn) => boolean
}> = {
  income: {
    title: "Income",
    color: "text-positive",
    predicate: t => t.amount > 0 && t.category?.type !== "transfer",
  },
  expenses: {
    title: "Expenses",
    color: "text-negative",
    predicate: t => t.amount < 0 && t.category?.type !== "savings" && t.category?.type !== "transfer",
  },
  saved: {
    title: "Saved",
    color: "text-info",
    predicate: t => t.amount < 0 && t.category?.type === "savings",
  },
  // Net = income − expenses, so it spans both — everything except transfers
  // and savings outflows. Summing signed amounts over this set yields net.
  net: {
    title: "Net",
    color: "text-foreground",
    predicate: t => t.category?.type !== "transfer" && !(t.amount < 0 && t.category?.type === "savings"),
  },
}

type SortKey = "date" | "counterparty" | "category" | "amount"
type SortDir = "asc" | "desc"

// Applies the drill-down search + category filter, then sorts.
function filterAndSort(
  txns: Txn[],
  search: string,
  category: string,
  sort: { key: SortKey; dir: SortDir },
): Txn[] {
  const q = search.trim().toLowerCase()
  const filtered = txns.filter(t => {
    if (category !== "all" && (t.category?.name ?? "Uncategorized") !== category) return false
    if (q && !(`${t.counterparty} ${t.bookingText ?? ""}`.toLowerCase().includes(q))) return false
    return true
  })

  const sign = sort.dir === "asc" ? 1 : -1
  return filtered.sort((a, b) => {
    switch (sort.key) {
      case "date":         return sign * (new Date(a.date).getTime() - new Date(b.date).getTime())
      case "amount":       return sign * (Math.abs(a.amount) - Math.abs(b.amount))
      case "counterparty": return sign * a.counterparty.localeCompare(b.counterparty)
      case "category":     return sign * (a.category?.name ?? "Uncategorized").localeCompare(b.category?.name ?? "Uncategorized")
    }
  })
}

// A clickable, sortable column header showing the current sort direction.
function SortHeader({
  label, sortKey, active, dir, onSort, align = "left",
}: {
  label: string; sortKey: SortKey; active: boolean; dir: SortDir
  onSort: (key: SortKey) => void; align?: "left" | "right"
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
        active ? "text-foreground" : ""
      } ${align === "right" ? "flex-row-reverse" : ""}`}
    >
      {label}
      <Icon className="h-3 w-3" />
    </button>
  )
}

// A stat card that behaves as a button — opens its drill-down on click/Enter.
function StatCard({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick() } }}
      className="cursor-pointer transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CardContent className="pt-6">{children}</CardContent>
    </Card>
  )
}

function BudgetSankey({
  income,
  byCategory,
  bySavings,
  net,
}: {
  income: number
  byCategory: Summary["byCategory"]
  bySavings:  Summary["bySavings"]
  net:        number
}) {
  if (income <= 0) return null

  const rightNodes = [
    ...byCategory.filter(c => c.type === "fixed").sort((a, b) => b.actual - a.actual),
    ...byCategory.filter(c => c.type === "variable").sort((a, b) => b.actual - a.actual),
    ...bySavings.sort((a, b) => b.actual - a.actual),
    ...(net > 0 ? [{ categoryName: "Remaining", actual: net, color: "#9999aa" }] : []),
  ].map(c => ({ name: c.categoryName, value: c.actual, color: c.color }))

  if (rightNodes.length === 0) return null

  const VW = 660
  const leftLabelW = 98, nodeW = 14, rightLabelW = 158
  const pTop = 10, pBottom = 10, gap = 5

  const leftNodeX  = leftLabelW
  const rightNodeX = VW - rightLabelW - nodeW

  // srcH is fixed — income bar always fills this height.
  // VH grows to give the right column room for inter-node gaps.
  const srcH = 280
  const VH   = srcH + pTop + pBottom + (rightNodes.length - 1) * gap

  // Link heights: strictly proportional to value/income — no minimum clamping
  // so the source links always sum exactly to srcH.
  const linkHeights = rightNodes.map(n => (n.value / income) * srcH)

  // Source side: stacked flush, no gaps — sums to srcH
  let sy = pTop
  const srcPos = rightNodes.map((_, i) => {
    const h   = linkHeights[i]
    const pos = { y1: sy, y2: sy + h }
    sy += h
    return pos
  })

  // Destination side: same heights, separated by gaps — starts at pTop
  let dy = pTop
  const destPos = rightNodes.map((_, i) => {
    const h   = linkHeights[i]
    const pos = { y: dy, h }
    dy += h + gap
    return pos
  })

  const midX     = (leftNodeX + nodeW + rightNodeX) / 2
  const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + "…" : s

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ display: "block" }}>
      {/* Income node — always spans full srcH */}
      <rect x={leftNodeX} y={pTop} width={nodeW} height={srcH} fill="#6aaa7a" rx={2} />
      <text
        x={leftNodeX - 7} y={pTop + srcH / 2 - 7}
        textAnchor="end" dominantBaseline="middle"
        fontSize={11} fill="currentColor" opacity={0.8}
      >
        Income
      </text>
      <text
        x={leftNodeX - 7} y={pTop + srcH / 2 + 7}
        textAnchor="end" dominantBaseline="middle"
        fontSize={9} fill="currentColor" opacity={0.5}
      >
        Fr. {fmtR(income)}
      </text>

      {rightNodes.map((node, i) => {
        const { y1, y2 }  = srcPos[i]
        const { y, h }    = destPos[i]
        const path = [
          `M ${leftNodeX + nodeW} ${y1}`,
          `C ${midX} ${y1} ${midX} ${y} ${rightNodeX} ${y}`,
          `L ${rightNodeX} ${y + h}`,
          `C ${midX} ${y + h} ${midX} ${y2} ${leftNodeX + nodeW} ${y2}`,
          `Z`,
        ].join(" ")
        const midY   = y + h / 2
        const labelX = rightNodeX + nodeW + 6

        return (
          <g key={node.name}>
            <path d={path} fill={node.color} opacity={0.2} />
            <rect x={rightNodeX} y={y} width={nodeW} height={h} fill={node.color} rx={2} />
            {h >= 8 && (
              <text
                x={labelX} y={midY - (h >= 18 ? 6 : 0)}
                dominantBaseline="middle" fontSize={10}
                fill="currentColor" opacity={0.75}
              >
                {truncate(node.name, 17)}
              </text>
            )}
            {h >= 18 && (
              <text
                x={labelX} y={midY + 8}
                dominantBaseline="middle" fontSize={9}
                fill="currentColor" opacity={0.5}
              >
                Fr. {fmtR(node.value)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// A single row in the "Largest outflows" list — shared by the default view and
// the per-category filtered view.
function OutflowRow({ date, counterparty, amount, categoryName, color }: {
  date: string; counterparty: string; amount: number; categoryName: string; color: string
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground w-14 flex-shrink-0">
        {new Date(date).toLocaleDateString("de-CH", { day: "2-digit", month: "short" })}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{counterparty}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <div className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ background: color }} />
          <span className="text-xs text-muted-foreground">{categoryName}</span>
        </div>
      </div>
      <span className="font-mono text-sm text-negative flex-shrink-0">
        Fr. {fmt(Math.abs(amount))}
      </span>
    </div>
  )
}

export default function DashboardPage() {
  
  const [month, setMonth]   = useState("")
    const [months, setMonths] = useState<string[]>([])
  const [data, setData]       = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // Drill-down dialog: which stat card is open, and the month's matching txns.
  const [openKind, setOpenKind]       = useState<DrillKind | null>(null)
  const [txns, setTxns]               = useState<Txn[] | null>(null)
  const [txnsLoading, setTxnsLoading] = useState(false)

  // Drill-down filtering & sorting (reset each time a card is opened).
  const [drillSearch, setDrillSearch]     = useState("")
  const [drillCategory, setDrillCategory] = useState("all")
  const [drillSort, setDrillSort]         = useState<{ key: SortKey; dir: SortDir }>({ key: "date", dir: "desc" })

  // Donut → outflows drill-down: the category selected in the pie, and that
  // category's expense transactions (null = show the month's overall top 10).
  const [selectedCat, setSelectedCat] = useState<string | null>(null)
  const [catExpenses, setCatExpenses] = useState<Txn[] | null>(null)
  const [catLoading, setCatLoading]   = useState(false)

  // Toggle a category in the donut; fetch its expenses for the outflows list.
  function selectCategory(name: string) {
    if (name === selectedCat) { setSelectedCat(null); setCatExpenses(null); return }
    setSelectedCat(name)
    setCatExpenses(null)
    setCatLoading(true)

    const params = new URLSearchParams({ month, category: name, type: "expense", limit: "1000" })
    fetch(`/api/transactions?${params}`)
      .then(r => r.json())
      .then(d => setCatExpenses(((d.transactions ?? []) as Txn[]).sort((a, b) => a.amount - b.amount)))
      .catch(() => setCatExpenses([]))
      .finally(() => setCatLoading(false))
  }

  // Clicking a column header sorts by it; clicking the active column flips dir.
  function toggleSort(key: SortKey) {
    setDrillSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "date" || key === "amount" ? "desc" : "asc" },
    )
  }

  // Fetch the whole month once, then filter to the clicked card's predicate.
  function openDrill(kind: DrillKind) {
    setOpenKind(kind)
    setTxns(null)
    setTxnsLoading(true)
    setDrillSearch("")
    setDrillCategory("all")
    setDrillSort({ key: "date", dir: "desc" })

    fetch(`/api/transactions?month=${month}&limit=1000`)
      .then(r => r.json())
      .then(d => setTxns((d.transactions ?? []).filter(DRILL[kind].predicate)))
      .catch(() => setTxns([]))
      .finally(() => setTxnsLoading(false))
  }


useEffect(() => {
  fetch("/api/months")
    .then(r => r.json())
    .then(d => {
      const m = d.months ?? []
      setMonths(m)        // populate the dropdown
      if (m.length > 0) setMonth(m[0]) // default to most recent
      else { setError("No transactions found"); setLoading(false) }
    })
    .catch(() => { setError("Failed to load data"); setLoading(false) })
}, [])


  useEffect(() => {
    if (!month) return     // wait for /api/months to pick one
    let stale = false      // a slower response for a previous month must not win
    setLoading(true)
    setError(null)
    setSelectedCat(null)   // clear donut drill-down when the month changes
    setCatExpenses(null)
    fetch(`/api/summary?month=${month}`)
      .then(r => r.json())
      .then(d => {
        if (stale) return
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(() => { if (!stale) setError("Failed to load data") })
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
  }, [month])

  // Drill-down derived views: the categories present, and the filtered+sorted rows.
  const drillCategories = txns
    ? Array.from(new Set(txns.map(t => t.category?.name ?? "Uncategorized"))).sort()
    : []
  const visibleTxns = txns
    ? filterAndSort(txns, drillSearch, drillCategory, drillSort)
    : []
  const visibleTotal = visibleTxns.reduce(
    (s, t) => s + (openKind === "net" ? t.amount : Math.abs(t.amount)), 0,
  )

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">

      {/* Header */}
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <p className="text-xs tracking-widest uppercase text-muted-foreground mb-2">
            Dashboard
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Monthly Overview
          </h1>
        </div>
        <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="text-sm border border-border rounded-md px-3 py-2 bg-background text-foreground"
            >
            {months.map(m => (
                <option key={m} value={m}>{m}</option>
            ))}
        </select>
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground py-20 justify-center">
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Loading...
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive py-20 text-center">
          {error} — have you imported any transactions yet?
          <br />
          <a href="/import" className="underline mt-2 inline-block">
            Go to import
          </a>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-4">

          {/* Stat cards — click to drill into the underlying transactions */}
<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
  <StatCard onClick={() => openDrill("income")}>
    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
      Income
    </p>
    <p className="text-2xl font-semibold text-positive">
      Fr. {fmtR(data.summary.income)}
    </p>
  </StatCard>
  <StatCard onClick={() => openDrill("expenses")}>
    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
      Expenses
    </p>
    <p className="text-2xl font-semibold text-negative">
      Fr. {fmtR(data.summary.expenses)}
    </p>
  </StatCard>
  <StatCard onClick={() => openDrill("saved")}>
    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
      Saved
    </p>
    <p className="text-2xl font-semibold text-info">
      Fr. {fmtR(data.summary.saved)}
    </p>
    <p className="text-xs text-muted-foreground mt-1">
      {data.summary.savingsRate}% savings rate
    </p>
  </StatCard>
  <StatCard onClick={() => openDrill("net")}>
    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
      Net
    </p>
    <p className={`text-2xl font-semibold ${
      data.summary.net >= 0 ? "text-positive" : "text-negative"
    }`}>
      Fr. {fmtR(data.summary.net)}
    </p>
  </StatCard>
</div>


{/* Money flow */}
<Card>
  <CardHeader className="pb-2">
    <CardTitle className="text-sm font-medium text-muted-foreground">
      Money flow
    </CardTitle>
  </CardHeader>
  <CardContent className="pt-0 pb-3">
    <BudgetSankey
      income={data.summary.income}
      byCategory={data.byCategory}
      bySavings={data.bySavings}
      net={data.summary.net}
    />
  </CardContent>
</Card>

{/* Savings breakdown */}
{data.bySavings.length > 0 && (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">
        Savings & investments
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-2">
        {data.bySavings.map(s => (
          <div key={s.categoryName} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-sm flex-shrink-0"
                style={{ background: s.color }}
              />
              <span className="text-muted-foreground">{s.categoryName}</span>
            </div>
            <span className="font-mono text-positive">
              Fr. {fmtR(s.actual)}
            </span>
          </div>
        ))}
        <div className="flex justify-between items-center pt-2 border-t border-border text-sm font-semibold">
          <span>Total saved</span>
          <span className="font-mono text-info">
            Fr. {fmtR(data.summary.saved)}
          </span>
        </div>
      </div>
    </CardContent>
  </Card>
)}

          {/* ── Pace of the month in progress (renders nothing for a complete month) */}
          <SpendingPace month={month} />

          {/* ── Spending by type bar */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Spending allocation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mb-3">
                {[
                  { label: "Fixed",    value: data.byType.fixed,    color: "#8ab4d4" },
                  { label: "Variable", value: data.byType.variable, color: "#f0c080" },
                  { label: "Savings",  value: data.byType.savings,  color: "#6aaa7a" },
                ].map(seg => {
                  const total = data.byType.fixed + data.byType.variable + data.byType.savings
                  const pct = total > 0 ? (seg.value / total) * 100 : 0
                  return (
                    <div
                      key={seg.label}
                      style={{ width: `${pct}%`, background: seg.color }}
                    />
                  )
                })}
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                {[
                  { label: "Fixed",    value: data.byType.fixed,    color: "#8ab4d4" },
                  { label: "Variable", value: data.byType.variable, color: "#f0c080" },
                  { label: "Savings",  value: data.byType.savings,  color: "#6aaa7a" },
                ].map(seg => (
                  <div key={seg.label} className="flex items-center gap-1.5">
                    <div
                      className="w-2 h-2 rounded-sm"
                      style={{ background: seg.color }}
                    />
                    {seg.label} · Fr. {fmtR(seg.value)}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ── Pie + budget bars */}
          <div className="grid grid-cols-2 gap-4">

            {/* Pie chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  By category
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={data.byCategory.filter(c => c.type !== "savings")}
                      dataKey="actual"
                      nameKey="categoryName"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={2}
                      onClick={(d: any) => {
                        const name = d?.categoryName ?? d?.payload?.categoryName
                        if (name) selectCategory(name)
                      }}
                      className="cursor-pointer focus:outline-none"
                    >
                      {data.byCategory
                        .filter(c => c.type !== "savings")
                        .map((c, i) => (
                          <Cell
                            key={i}
                            fill={c.color}
                            stroke={selectedCat === c.categoryName ? "var(--foreground)" : undefined}
                            strokeWidth={selectedCat === c.categoryName ? 2 : 0}
                            fillOpacity={selectedCat && selectedCat !== c.categoryName ? 0.3 : 1}
                          />
                        ))
                      }
                    </Pie>
                    <Tooltip
                      formatter={(Value) => [`Fr. ${fmt(Number(Value))}`, ""]}
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        color: "var(--card-foreground)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-0.5 mt-2">
                  {data.byCategory
                    .filter(c => c.type !== "savings")
                    .slice(0, 6)
                    .map(c => {
                      const active = selectedCat === c.categoryName
                      return (
                        <button
                          key={c.categoryName}
                          type="button"
                          onClick={() => selectCategory(c.categoryName)}
                          className={`w-full flex items-center justify-between text-xs rounded px-1.5 py-1 transition-colors hover:bg-accent ${
                            active ? "bg-accent" : ""
                          } ${selectedCat && !active ? "opacity-50" : ""}`}
                        >
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: c.color }} />
                            <span className={active ? "text-foreground font-medium" : "text-muted-foreground"}>
                              {c.categoryName}
                            </span>
                          </div>
                          <span className="font-mono">Fr. {fmtR(c.actual)}</span>
                        </button>
                      )
                    })
                  }
                </div>
              </CardContent>
            </Card>

            {/* Budget vs actual */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Budget vs actual
                  </CardTitle>
                  <a href="/budgets" className="text-xs text-muted-foreground underline hover:text-foreground">
                    {data.flags.length === 0 ? "Set budgets" : "Edit"}
                  </a>
                </div>
              </CardHeader>
              <CardContent>
                {data.flags.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No budgets set yet. <a href="/budgets" className="underline">Set budgets</a> to compare each month against a plan.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {/* Headline: total spent vs total budgeted this month */}
                    {(() => {
                      const { actual, budget } = data.budgetTotals
                      const over = actual > budget
                      const pct = budget > 0 ? Math.min(100, (actual / budget) * 100) : 0
                      return (
                        <div className="pb-1">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">
                              Fr. {fmtR(actual)} of Fr. {fmtR(budget)}
                            </span>
                            <span className="font-mono" style={{ color: over ? "#d4857a" : "#6aaa7a" }}>
                              {over ? "+" : "−"}Fr. {fmtR(Math.abs(actual - budget))}
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, background: over ? "#d4857a" : "#6aaa7a" }}
                            />
                          </div>
                        </div>
                      )
                    })()}
                    {data.flags.map(f => {
                      const max = Math.max(f.actual, f.budget)
                      const actualPct = (f.actual / max) * 100
                      const budgetPct = (f.budget / max) * 100
                      const over = f.status === "over"
                      return (
                        <div key={f.categoryName}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">
                              {f.categoryName}
                            </span>
                            <span
                              className="font-mono"
                              style={{ color: over ? "#d4857a" : "#6aaa7a" }}
                            >
                              {over ? "+" : "−"}Fr. {fmtR(Math.abs(f.delta))}
                            </span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-0.5">
                            <div
                              className="h-full rounded-full opacity-40"
                              style={{
                                width: `${budgetPct}%`,
                                background: f.color,
                              }}
                            />
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${actualPct}%`,
                                background: over ? "#d4857a" : "#6aaa7a",
                              }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Top expenses — filtered by the donut selection if any */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Largest outflows{selectedCat ? <span className="text-foreground"> · {selectedCat}</span> : null}
                </CardTitle>
                {selectedCat && (
                  <button
                    type="button"
                    onClick={() => { setSelectedCat(null); setCatExpenses(null) }}
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    Show all
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!selectedCat && (
                <div className="space-y-0">
                  {data.topExpenses.map(tx => (
                    <OutflowRow
                      key={tx.id}
                      date={tx.date}
                      counterparty={tx.counterparty}
                      amount={tx.amount}
                      categoryName={tx.category}
                      color={tx.color}
                    />
                  ))}
                </div>
              )}

              {selectedCat && catLoading && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground py-8 justify-center">
                  <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  Loading...
                </div>
              )}

              {selectedCat && !catLoading && catExpenses && catExpenses.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No expenses in {selectedCat} this month.
                </p>
              )}

              {selectedCat && !catLoading && catExpenses && catExpenses.length > 0 && (
                <div className="space-y-0">
                  {catExpenses.slice(0, 15).map(tx => (
                    <OutflowRow
                      key={tx.id}
                      date={tx.date}
                      counterparty={tx.counterparty}
                      amount={tx.amount}
                      categoryName={tx.category?.name ?? "Uncategorized"}
                      color={tx.category?.color ?? "#888888"}
                    />
                  ))}
                  {catExpenses.length > 15 && (
                    <p className="text-xs text-muted-foreground pt-2">
                      Showing top 15 of {catExpenses.length}.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Savings transactions */}
{data.savingsTransactions.length > 0 && (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">
        Savings & investments
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div>
        {data.savingsTransactions.map(tx => (
          <div
            key={tx.id}
            className="flex items-center gap-3 py-2.5 border-b border-border last:border-0"
          >
            <span className="text-xs text-muted-foreground w-14 flex-shrink-0">
              {new Date(tx.date).toLocaleDateString("de-CH", {
                day: "2-digit", month: "short"
              })}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{tx.counterparty}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div
                  className="w-1.5 h-1.5 rounded-sm flex-shrink-0"
                  style={{ background: tx.color }}
                />
                <span className="text-xs text-muted-foreground">
                  {tx.category}
                </span>
              </div>
            </div>
            <span className="font-mono text-sm text-info flex-shrink-0">
              Fr. {fmt(Math.abs(tx.amount))}
            </span>
          </div>
        ))}
        <div className="flex justify-between items-center pt-3 border-t border-border text-sm font-semibold">
          <span className="text-muted-foreground">Total saved</span>
          <span className="font-mono text-info">
            Fr. {fmt(data.summary.saved)}
          </span>
        </div>
      </div>
    </CardContent>
  </Card>
)}

        </div>
      )}

      {/* Drill-down: the month's transactions behind the clicked stat card */}
      <Dialog open={openKind !== null} onOpenChange={o => { if (!o) setOpenKind(null) }}>
        <DialogContent className="max-w-4xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>
              {openKind ? DRILL[openKind].title : ""} · {month}
            </DialogTitle>
            <DialogDescription>
              {txns
                ? `${visibleTxns.length} of ${txns.length} transaction${txns.length === 1 ? "" : "s"} · Fr. ${fmt(visibleTotal)}`
                : "Loading transactions…"}
            </DialogDescription>
          </DialogHeader>

          {/* Filters */}
          {!txnsLoading && txns && txns.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Search counterparty or text…"
                value={drillSearch}
                onChange={e => setDrillSearch(e.target.value)}
                className="h-8 max-w-xs"
              />
              <Select value={drillCategory} onValueChange={setDrillCategory}>
                <SelectTrigger className="h-8 w-[200px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {drillCategories.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(drillSearch || drillCategory !== "all") && (
                <button
                  type="button"
                  onClick={() => { setDrillSearch(""); setDrillCategory("all") }}
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          <div className="max-h-[60vh] overflow-y-auto">
            {txnsLoading && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground py-10 justify-center">
                <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                Loading...
              </div>
            )}

            {!txnsLoading && txns && txns.length === 0 && (
              <p className="text-sm text-muted-foreground py-10 text-center">
                No transactions found.
              </p>
            )}

            {!txnsLoading && txns && txns.length > 0 && visibleTxns.length === 0 && (
              <p className="text-sm text-muted-foreground py-10 text-center">
                No transactions match your filters.
              </p>
            )}

            {!txnsLoading && txns && visibleTxns.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <SortHeader label="Date" sortKey="date" active={drillSort.key === "date"} dir={drillSort.dir} onSort={toggleSort} />
                    </TableHead>
                    <TableHead>
                      <SortHeader label="Counterparty" sortKey="counterparty" active={drillSort.key === "counterparty"} dir={drillSort.dir} onSort={toggleSort} />
                    </TableHead>
                    <TableHead>
                      <SortHeader label="Category" sortKey="category" active={drillSort.key === "category"} dir={drillSort.dir} onSort={toggleSort} />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortHeader label="Amount" sortKey="amount" active={drillSort.key === "amount"} dir={drillSort.dir} onSort={toggleSort} align="right" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleTxns.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {new Date(t.date).toLocaleDateString("de-CH")}
                      </TableCell>
                      <TableCell>
                        <div>{t.counterparty}</div>
                        {t.bookingText && (
                          <div className="text-xs text-muted-foreground truncate max-w-[320px]">
                            {t.bookingText}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span
                            className="w-2 h-2 rounded-sm flex-shrink-0"
                            style={{ background: t.category?.color ?? "#888888" }}
                          />
                          {t.category?.name ?? "Uncategorized"}
                        </span>
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono whitespace-nowrap ${
                          openKind === "net"
                            ? t.amount >= 0 ? "text-positive" : "text-negative"
                            : openKind ? DRILL[openKind].color : ""
                        }`}
                      >
                        {openKind === "net" && t.amount < 0 ? "−" : ""}Fr. {fmt(Math.abs(t.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}