"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table"
import { DIRECTIONS, MATCH_TYPES } from "@/lib/rules"
import { useT } from "@/lib/i18n/provider"

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

const selectClass = "text-sm rounded-xl border border-input px-2 py-1.5 bg-card text-foreground"

// Throws the server's message, or an empty one when it sent none (callers show a
// translated fallback).
export async function createRule(body: {
  pattern: string; matchType?: string; direction?: string; categoryId: number; apply: boolean
}): Promise<{ applied: number }> {
  const res = await fetch("/api/rules", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  })
  const d = await res.json()
  if (!res.ok) throw new Error(d.error ?? "")
  return { applied: d.applied ?? 0 }
}

// Manage auto-categorization rules. New imports use them automatically; the
// "Apply" buttons re-categorize transactions already in the database.
export function RulesTab() {
  const { t } = useT()
  const matchLabel = (v: string) => (MATCH_TYPES.some(m => m.value === v) ? t(`rules.match.${v as (typeof MATCH_TYPES)[number]["value"]}`) : v)
  const dirLabel = (v: string) => (DIRECTIONS.some(d => d.value === v) ? t(`rules.dir.${v as (typeof DIRECTIONS)[number]["value"]}`) : v)
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
      setError(e instanceof Error && e.message ? e.message : t("rules.wentWrong"))
    } finally {
      setBusy(false)
    }
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    run(async () => {
      const { applied } = await createRule({ pattern, matchType, direction, categoryId: Number(categoryId), apply })
      setPattern("")
      return apply ? t("rules.addedApplied", { count: applied }) : t("rules.added")
    })
  }

  const applyRules = (ruleId?: number, count = 0) => {
    if (!confirm(t("rules.applyConfirm", { count }))) return
    run(async () => {
      const res = await fetch("/api/rules/apply", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ruleId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? t("rules.applyFailed"))
      return t("rules.applied", { count: d.updated })
    })
  }

  const patch = (id: number, data: object) => run(async () => {
    const res = await fetch("/api/rules", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...data }),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? t("rules.updateFailed"))
    return t("rules.updated")
  })

  const remove = (r: RuleRow) => {
    if (!confirm(t("rules.deleteConfirm", { pattern: r.pattern }))) return
    run(async () => {
      const res = await fetch(`/api/rules?id=${r.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error ?? t("rules.deleteFailed"))
      return t("rules.deleted")
    })
  }

  const pendingTotal = rules?.reduce((s, r) => s + r.pending, 0) ?? 0

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("rules.intro")}
      </p>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={add} className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("rules.counterparty")}</span>
            <select aria-label={t("rules.matchTypeAria")} value={matchType} onChange={e => setMatchType(e.target.value)} className={selectClass}>
              {MATCH_TYPES.map(m => <option key={m.value} value={m.value}>{matchLabel(m.value)}</option>)}
            </select>
            <Input
              aria-label={t("rule.suggest.textAria")} placeholder={t("rules.example")} value={pattern}
              onChange={e => setPattern(e.target.value)} className="h-8 w-44"
            />
            <select aria-label={t("rules.directionAria")} value={direction} onChange={e => setDirection(e.target.value)} className={selectClass}>
              {DIRECTIONS.map(d => <option key={d.value} value={d.value}>{dirLabel(d.value)}</option>)}
            </select>
            <span className="text-sm text-muted-foreground">→</span>
            <select aria-label={t("dashboard.drill.category")} value={categoryId} onChange={e => setCategoryId(e.target.value)} className={selectClass} required>
              <option value="">{t("rules.categoryOption")}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={apply} onChange={e => setApply(e.target.checked)} />
              {t("rules.alsoExisting")}
            </label>
            <Button type="submit" size="sm" disabled={busy || pattern.trim().length < 2 || !categoryId}>{t("rules.add")}</Button>
          </form>
        </CardContent>
      </Card>

      {notice && <p className="text-sm text-positive">{notice}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!rules ? (
        <p className="text-sm text-muted-foreground py-10 text-center">{t("common.loading")}</p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">
          {t("rules.none")}
        </p>
      ) : (
        <Card>
          <CardContent className="pt-6">
            {pendingTotal > 0 && (
              <div className="flex items-center justify-between gap-2 mb-3 text-sm">
                <span className="text-muted-foreground">
                  {t("rules.pending", { count: pendingTotal })}
                </span>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => applyRules(undefined, pendingTotal)}>
                  {t("rules.applyAll")}
                </Button>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("rules.th.rule")}</TableHead>
                  <TableHead className="w-48">{t("dashboard.drill.category")}</TableHead>
                  <TableHead className="text-right">{t("rules.th.matches")}</TableHead>
                  <TableHead><span className="sr-only">{t("data.cat.actions")}</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <span className="text-muted-foreground text-xs">{matchLabel(r.matchType)} </span>
                      <span>“{r.pattern}”</span>
                      {r.direction !== "any" && <span className="text-muted-foreground text-xs"> · {dirLabel(r.direction)}</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: r.category?.color ?? "transparent" }} />
                        <select
                          aria-label={t("rules.categoryAria", { pattern: r.pattern })} value={r.categoryId} disabled={busy}
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
                          {t("rules.applyTo", { count: r.pending })}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" disabled={busy} onClick={() => remove(r)}>
                        {t("common.delete")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-3">
              {t("rules.note")}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
