"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table"
import { DIRECTIONS, MATCH_TYPES } from "@/lib/rules"

interface CategoryOption { id: number; name: string; color: string }

interface RuleRow {
  id:         number
  pattern:    string
  matchType:  string
  direction:  string
  categoryId: number
  category:   CategoryOption | null
  matches:    number
  pending:    number
}

const selectClass = "text-sm border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
const label = (list: readonly { value: string; label: string }[], v: string) => list.find(x => x.value === v)?.label ?? v

export async function createRule(body: {
  pattern: string; matchType?: string; direction?: string; categoryId: number; apply: boolean
}): Promise<{ applied: number }> {
  const res = await fetch("/api/rules", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  })
  const d = await res.json()
  if (!res.ok) throw new Error(d.error ?? "Failed to create rule")
  return { applied: d.applied ?? 0 }
}

// Manage auto-categorization rules. New imports use them automatically; the
// "Apply" buttons re-categorize transactions already in the database.
export function RulesTab() {
  const [rules, setRules]           = useState<RuleRow[] | null>(null)
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [notice, setNotice]         = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [busy, setBusy]             = useState(false)

  const [pattern, setPattern]       = useState("")
  const [matchType, setMatchType]   = useState("contains")
  const [direction, setDirection]   = useState("any")
  const [categoryId, setCategoryId] = useState("")
  const [apply, setApply]           = useState(true)

  const fetchRules = useCallback(async () => {
    const d = await fetch("/api/rules").then(r => r.json())
    if (d.error) throw new Error(d.error)
    return d.rules as RuleRow[]
  }, [])
  const reload = useCallback(() => fetchRules().then(setRules).catch(e => setError(e.message)), [fetchRules])

  useEffect(() => {
    fetchRules().then(setRules).catch(e => setError(e.message))
    fetch("/api/categories").then(r => r.json()).then(d => setCategories(d.categories ?? []))
  }, [fetchRules])

  async function run(work: () => Promise<string>) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      setNotice(await work())
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setBusy(false)
    }
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    run(async () => {
      const { applied } = await createRule({ pattern, matchType, direction, categoryId: Number(categoryId), apply })
      setPattern("")
      return apply ? `Rule added — ${applied} existing transaction${applied === 1 ? "" : "s"} re-categorized.` : "Rule added."
    })
  }

  const applyRules = (ruleId?: number, count = 0) => {
    if (!confirm(`Re-categorize ${count} transaction${count === 1 ? "" : "s"}? This overwrites categories you set by hand on them.`)) return
    run(async () => {
      const res = await fetch("/api/rules/apply", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ruleId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? "Failed to apply")
      return `${d.updated} transaction${d.updated === 1 ? "" : "s"} re-categorized.`
    })
  }

  const patch = (id: number, data: object) => run(async () => {
    const res = await fetch("/api/rules", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...data }),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? "Failed to update rule")
    return "Rule updated."
  })

  const remove = (r: RuleRow) => {
    if (!confirm(`Delete the rule “${r.pattern}”? Transactions keep their current category.`)) return
    run(async () => {
      const res = await fetch(`/api/rules?id=${r.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to delete rule")
      return "Rule deleted."
    })
  }

  const pendingTotal = rules?.reduce((s, r) => s + r.pending, 0) ?? 0

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Rules categorize transactions by their counterparty. Every import applies them before the bank&apos;s own
        categories; when several match, the longest text wins (“Coop Pronto” beats “Coop”).
      </p>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={add} className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Counterparty</span>
            <select aria-label="Match type" value={matchType} onChange={e => setMatchType(e.target.value)} className={selectClass}>
              {MATCH_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <Input
              aria-label="Text to match" placeholder="e.g. Migros" value={pattern}
              onChange={e => setPattern(e.target.value)} className="h-8 w-44"
            />
            <select aria-label="Direction" value={direction} onChange={e => setDirection(e.target.value)} className={selectClass}>
              {DIRECTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <span className="text-sm text-muted-foreground">→</span>
            <select aria-label="Category" value={categoryId} onChange={e => setCategoryId(e.target.value)} className={selectClass} required>
              <option value="">Category…</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={apply} onChange={e => setApply(e.target.checked)} />
              also re-categorize existing
            </label>
            <Button type="submit" size="sm" disabled={busy || pattern.trim().length < 2 || !categoryId}>Add rule</Button>
          </form>
        </CardContent>
      </Card>

      {notice && <p className="text-sm text-positive">{notice}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!rules ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Loading…</p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">
          No rules yet. Add one above, or change a transaction&apos;s category on the Transactions tab — you&apos;ll be
          offered a rule for it.
        </p>
      ) : (
        <Card>
          <CardContent className="pt-6">
            {pendingTotal > 0 && (
              <div className="flex items-center justify-between gap-2 mb-3 text-sm">
                <span className="text-muted-foreground">
                  {pendingTotal} transaction{pendingTotal === 1 ? "" : "s"} don&apos;t match their rule&apos;s category yet.
                </span>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => applyRules(undefined, pendingTotal)}>
                  Apply all rules
                </Button>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead className="w-48">Category</TableHead>
                  <TableHead className="text-right">Matches</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <span className="text-muted-foreground text-xs">{label(MATCH_TYPES, r.matchType)} </span>
                      <span className="font-medium">“{r.pattern}”</span>
                      {r.direction !== "any" && <span className="text-muted-foreground text-xs"> · {label(DIRECTIONS, r.direction)}</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: r.category?.color ?? "transparent" }} />
                        <select
                          aria-label={`Category for “${r.pattern}”`} value={r.categoryId} disabled={busy}
                          onChange={e => patch(r.id, { categoryId: Number(e.target.value) })}
                          className={`${selectClass} flex-1 min-w-0`}
                        >
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{r.matches}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {r.pending > 0 && (
                        <Button size="sm" variant="outline" className="h-7 text-xs mr-1" disabled={busy} onClick={() => applyRules(r.id, r.pending)}>
                          Apply to {r.pending}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" disabled={busy} onClick={() => remove(r)}>
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-3">
              Matches counts the transactions each rule decides. Applying overwrites categories set by hand on those transactions.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
