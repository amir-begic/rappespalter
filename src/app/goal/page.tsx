"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, Trash2, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { PageLoading } from "@/components/page-loading"
import { GoalArt, goalColor } from "@/components/goal-art"
import {
  ASSETS, GOAL_KINDS, HOME_DEFAULTS, LOCKED_ASSETS, SAVINGS_TARGETS, allocate, assetLabel, homeTarget, progressOf, project,
  type Allocation, type AssetKey, type AssetValues, type Goal, type GoalKind, type HomeParams,
} from "@/lib/goals"

interface GoalsData {
  goals:        Goal[]
  balances:     AssetValues
  balanceMonth: string | null
  pace:         AssetValues
  paceMonths:   string[]
  savingsCategories: { id: number; name: string; color: string; asset: AssetKey }[]
}

type Draft = Omit<Goal, "id"> & { id: number | null }

const fmtR = (n: number) => Math.round(n).toLocaleString("de-CH")
const fmtMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number)
  return new Date(y, mo - 1).toLocaleDateString("de-CH", { month: "long", year: "numeric" })
}
const thisMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
const selectClass = "text-sm rounded-xl border border-input px-2 py-1.5 bg-card text-foreground"

// The house goal used to live in localStorage (lost by the desktop app on every
// launch, as it serves the UI from a new port). Moved into the database once.
const LEGACY_KEY = "rappespalter.goal"

function newDraft(kind: GoalKind): Draft {
  return {
    id: null, kind, name: GOAL_KINDS[kind].name, targetDate: null,
    params: kind === "home" ? HOME_DEFAULTS : null,
    target: kind === "home" ? homeTarget(HOME_DEFAULTS) : 0,
    allocations: [],
  }
}

async function saveGoal(draft: Draft) {
  const res = await fetch("/api/goals", {
    method: draft.id == null ? "POST" : "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  })
  if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save")
}

export default function GoalsPage() {
  const [data, setData]     = useState<GoalsData | null>(null)
  const [error, setError]   = useState<string | null>(null)
  const [draft, setDraft]   = useState<Draft | null>(null)

  function load() {
    fetch("/api/goals")
      .then(r => r.json())
      .then(async (d: GoalsData & { error?: string }) => {
        if (d.error) { setError(d.error); return }
        const legacy = !d.goals.length ? localStorage.getItem(LEGACY_KEY) : null
        if (legacy) {
          localStorage.removeItem(LEGACY_KEY)
          const params: HomeParams = { ...HOME_DEFAULTS, ...JSON.parse(legacy) }
          // The old page counted all liquid assets towards the house.
          await saveGoal({
            ...newDraft("home"), params, target: homeTarget(params),
            allocations: (["checking", "savings", "etf"] as const).map(asset => ({ asset, mode: "percent", value: 100 })),
          }).catch(() => {})
          return load()
        }
        setData(d)
      })
      .catch(() => setError("Failed to load goals"))
  }
  useEffect(load, [])

  const allocated = data && allocate(data.goals, data.balances)
  const now = thisMonth()

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">

      <div className="mb-8">
        <p className="text-xs uppercase text-muted-foreground mb-2">Planning</p>
        <h1>Goals</h1>
        <p className="text-sm text-muted-foreground mt-2">
          What you&apos;re saving for, with part of your assets set aside for each — and when each goal
          is reached at your current savings pace.
        </p>
      </div>

      {!data && !error && <PageLoading />}
      {error && <div className="text-sm text-destructive py-20 text-center">{error}</div>}

      {data && allocated && (
        <div className="space-y-4">

          {!data.balanceMonth && (
            <div className="rounded-lg border border-info/40 bg-info/10 px-4 py-3 text-sm">
              Goals use the balances from your latest snapshot — record one on{" "}
              <Link href="/projections" className="underline">Projections</Link> first.
            </div>
          )}

          {data.goals.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {data.goals.map(goal => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  progress={progressOf(goal, allocated, data.pace)}
                  now={now}
                  onEdit={() => setDraft({ ...goal })}
                />
              ))}
            </div>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {data.goals.length ? "Add a goal" : "What are you saving for?"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {(Object.keys(GOAL_KINDS) as GoalKind[]).map(kind => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setDraft(newDraft(kind))}
                    className="group flex flex-col items-center gap-1 rounded-xl p-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <GoalArt kind={kind} className="size-14 transition-transform group-hover:-rotate-6 group-hover:scale-105" />
                    {GOAL_KINDS[kind].label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {data.goals.length > 0 && <AssetSplit data={data} allocated={allocated} onSourceChange={load} />}

          <p className="text-xs text-muted-foreground text-center pb-4 leading-relaxed">
            Balances from your {data.balanceMonth ? fmtMonth(data.balanceMonth) : "latest"} snapshot. Each goal grows
            by its percentage of what goes into an asset each month — the average of{" "}
            {data.paceMonths.length ? `${fmtMonth(data.paceMonths[0])} to ${fmtMonth(data.paceMonths.at(-1)!)}` : "recent months"},
            one-offs left out, investment returns ignored. Fixed amounts stay as they are.
          </p>
        </div>
      )}

      {draft && data && (
        <GoalEditor
          draft={draft}
          data={data}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSaved={() => { setDraft(null); load() }}
        />
      )}
    </div>
  )
}

function GoalCard({ goal, progress, now, onEdit }: {
  goal: Goal; progress: ReturnType<typeof progressOf>; now: string; onEdit: () => void
}) {
  const p = project(goal, progress, now)
  const pct = goal.target > 0 ? Math.min(100, progress.current / goal.target * 100) : 0

  let status: React.ReactNode
  if (goal.target <= 0) status = "Set a target to see progress."
  else if (p.reached) status = <span className="text-positive">Reached 🎉</span>
  else if (p.date) status = <>At Fr. {fmtR(progress.monthly)}/month: <strong className="font-medium">{fmtMonth(p.date)}</strong></>
  else status = "Not growing yet — give it a percentage of an asset you save into."

  return (
    <Card role="group" aria-label={goal.name}>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <GoalArt kind={goal.kind} className="size-16 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase text-muted-foreground">{GOAL_KINDS[goal.kind].label}</p>
            <p className="truncate text-lg">{goal.name}</p>
            <p className="text-sm text-muted-foreground font-mono">
              Fr. {fmtR(progress.current)} <span className="text-xs">of</span> {fmtR(goal.target)}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button>
        </div>

        <div className="mt-4 h-2.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: goalColor(goal.kind) }} />
        </div>
        <div className="mt-2 flex justify-between gap-2 text-xs text-muted-foreground">
          <span>{status}</span>
          <span className="font-mono">{pct.toFixed(0)}%</span>
        </div>

        {goal.targetDate && !p.reached && p.needed != null && (
          <p className={`mt-1 text-xs ${p.onTrack ? "text-positive" : "text-negative"}`}>
            Target {fmtMonth(goal.targetDate)}:{" "}
            {p.monthsLeft != null && p.monthsLeft <= 0
              ? `Fr. ${fmtR(p.remaining)} still missing`
              : `needs Fr. ${fmtR(p.needed)}/month — ${p.onTrack ? "on track" : "behind"}`}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// How each asset is split between goals, with what's left over.
function AssetSplit({ data, allocated, onSourceChange }: {
  data: GoalsData; allocated: ReturnType<typeof allocate>; onSourceChange: () => void
}) {
  async function setSource(categoryId: number, asset: AssetKey) {
    await fetch("/api/goals", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoryId, asset }),
    })
    onSourceChange()
  }

  const rows = ASSETS.filter(a => data.balances[a.key] > 0 || allocated.byAsset[a.key].percent > 0 || allocated.byAsset[a.key].fixed > 0)
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">Where the money is</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map(({ key }) => {
          const use = allocated.byAsset[key]
          const parts = data.goals.flatMap(g => g.allocations
            .filter(a => a.asset === key)
            .map(a => ({ goal: g, amount: allocated.amountOf(a) })))
          return (
            <div key={key}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span>{assetLabel(key)}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  Fr. {fmtR(use.balance)} · {fmtR(use.free)} free
                  {data.pace[key] !== 0 && ` · ${data.pace[key] > 0 ? "+" : "−"}Fr. ${fmtR(Math.abs(data.pace[key]))}/mo`}
                </span>
              </div>
              <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-muted">
                {parts.map((part, i) => use.balance > 0 && part.amount > 0 && (
                  <div
                    key={i}
                    title={`${part.goal.name}: Fr. ${fmtR(part.amount)}`}
                    className="h-full border-r-2 border-card last:border-r-0"
                    style={{ width: `${part.amount / use.balance * 100}%`, background: goalColor(part.goal.kind) }}
                  />
                ))}
              </div>
              {use.over && (
                <p className="mt-1 text-xs text-negative">
                  More is set aside than the account holds — goals share it proportionally until you lower an allocation.
                </p>
              )}
            </div>
          )
        })}
        {data.savingsCategories.length > 0 && (
          <div className="border-t border-border pt-3 text-xs text-muted-foreground">
            <p className="mb-2">Your savings categories go to (sets each account&apos;s monthly pace):</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {data.savingsCategories.map(c => (
                <label key={c.id} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-sm" style={{ background: c.color }} />
                  {c.name} →
                  <select
                    value={c.asset}
                    onChange={e => setSource(c.id, e.target.value as AssetKey)}
                    className="rounded-lg border border-input bg-card px-1.5 py-0.5 text-foreground"
                  >
                    {SAVINGS_TARGETS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {data.goals.map(g => (
            <span key={g.id} className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm" style={{ background: goalColor(g.kind) }} />{g.name}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function GoalEditor({ draft, data, onChange, onClose, onSaved }: {
  draft: Draft; data: GoalsData
  onChange: (d: Draft) => void; onClose: () => void; onSaved: () => void
}) {
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch })
  const setHome = (patch: Partial<HomeParams>) => {
    const params = { ...(draft.params ?? HOME_DEFAULTS), ...patch }
    set({ params, target: homeTarget(params) })
  }
  const setLine = (i: number, patch: Partial<Allocation>) =>
    set({ allocations: draft.allocations.map((a, j) => j === i ? { ...a, ...patch } : a) })

  // Preview with this draft in place of the saved goal.
  const asGoal: Goal = { ...draft, id: draft.id ?? -1 }
  const goals = [...data.goals.filter(g => g.id !== draft.id), asGoal]
  const allocated = allocate(goals, data.balances)
  const progress = progressOf(asGoal, allocated, data.pace)
  const home = draft.kind === "home"
  const unused = ASSETS.filter(a => !draft.allocations.some(l => l.asset === a.key) && (home || !LOCKED_ASSETS.has(a.key)))

  async function save() {
    setBusy(true)
    setError(null)
    try {
      // Pension money only counts towards a home.
      await saveGoal(home ? draft : { ...draft, allocations: draft.allocations.filter(a => !LOCKED_ASSETS.has(a.asset)) })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save")
      setBusy(false)
    }
  }

  async function remove() {
    if (draft.id == null || !window.confirm(`Delete “${draft.name}”? Its allocations are freed up.`)) return
    setBusy(true)
    const res = await fetch(`/api/goals?id=${draft.id}`, { method: "DELETE" })
    if (res.ok) onSaved()
    else { setError("Failed to delete"); setBusy(false) }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.id == null ? "New goal" : "Edit goal"}</DialogTitle>
          <DialogDescription>Pick what it&apos;s for, how much it needs, and which money is set aside for it.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-8 gap-1">
          {(Object.keys(GOAL_KINDS) as GoalKind[]).map(kind => (
            <button
              key={kind}
              type="button"
              title={GOAL_KINDS[kind].label}
              aria-pressed={draft.kind === kind}
              onClick={() => set({
                kind,
                ...(kind === "home" && !draft.params ? { params: HOME_DEFAULTS, target: homeTarget(HOME_DEFAULTS) } : {}),
                ...(kind !== "home" ? { params: null } : {}),
                ...(draft.name === GOAL_KINDS[draft.kind].name ? { name: GOAL_KINDS[kind].name } : {}),
              })}
              className={`rounded-xl p-1 transition-opacity ${draft.kind === kind ? "bg-accent" : "opacity-50 hover:opacity-100"}`}
            >
              <GoalArt kind={kind} className="size-full" />
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-xs uppercase text-muted-foreground">Name</span>
            <Input value={draft.name} maxLength={60} onChange={e => set({ name: e.target.value })} className="mt-1 h-9" />
          </label>

          {home ? (
            <div className="grid grid-cols-3 gap-3 sm:col-span-2">
              {([
                ["price", "Property price (Fr.)", 10000],
                ["depositPct", "Down payment (%)", 1],
                ["costsPct", "Extra costs (%)", 1],
              ] as const).map(([key, label, step]) => (
                <label key={key} className="block">
                  <span className="text-xs uppercase text-muted-foreground">{label}</span>
                  <Input
                    type="number" min={0} step={step} value={(draft.params ?? HOME_DEFAULTS)[key]}
                    onChange={e => setHome({ [key]: parseFloat(e.target.value) || 0 })}
                    className="mt-1 h-9"
                  />
                </label>
              ))}
              <p className="col-span-3 text-xs text-muted-foreground">
                Needs Fr. {fmtR(draft.target)} — down payment plus purchase costs.
              </p>
            </div>
          ) : (
            <label className="block">
              <span className="text-xs uppercase text-muted-foreground">Target (Fr.)</span>
              <Input
                type="number" min={0} step={100} value={draft.target || ""}
                onChange={e => set({ target: parseFloat(e.target.value) || 0 })}
                className="mt-1 h-9"
              />
            </label>
          )}

          <label className="block">
            <span className="text-xs uppercase text-muted-foreground">Target date (optional)</span>
            <Input
              type="month" value={draft.targetDate ?? ""}
              onChange={e => set({ targetDate: e.target.value || null })}
              className="mt-1 h-9"
            />
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase text-muted-foreground">Set aside for it</p>
          {draft.allocations.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing yet — add an account below.</p>
          )}
          {draft.allocations.map((a, i) => (
            <div key={a.asset} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">{assetLabel(a.asset)}</span>
              <select
                value={a.mode}
                onChange={e => setLine(i, { mode: e.target.value as Allocation["mode"], value: 0 })}
                aria-label={`How ${assetLabel(a.asset)} is set aside`}
                className={selectClass}
              >
                <option value="percent">% of it</option>
                <option value="amount">Fr.</option>
              </select>
              <Input
                type="number" min={0} max={a.mode === "percent" ? 100 : undefined} step={a.mode === "percent" ? 5 : 100}
                value={a.value || ""}
                onChange={e => setLine(i, { value: Math.max(0, parseFloat(e.target.value) || 0) })}
                aria-label={`${assetLabel(a.asset)} value`}
                className="h-8 w-24"
              />
              <span className="w-24 text-right font-mono text-xs text-muted-foreground">= Fr. {fmtR(progress.lines[i]?.amount ?? 0)}</span>
              <button type="button" aria-label={`Remove ${assetLabel(a.asset)}`} onClick={() => set({ allocations: draft.allocations.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
          ))}
          {unused.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {unused.map(a => (
                <Button key={a.key} size="sm" variant="outline" onClick={() => set({ allocations: [...draft.allocations, { asset: a.key as AssetKey, mode: "percent", value: 100 }] })}>
                  <Plus className="size-3" /> {a.label}
                </Button>
              ))}
            </div>
          )}
          {home && (
            <p className="text-xs text-muted-foreground">
              Säule 3a and 2. Säule can go towards a home you live in (early withdrawal); check the limits with your
              pension fund. Other goals can only use free money.
            </p>
          )}
          {ASSETS.some(a => allocated.byAsset[a.key].over && draft.allocations.some(l => l.asset === a.key)) && (
            <p className="text-xs text-negative">
              Some accounts are set aside for more than they hold, together with your other goals — they&apos;re shared proportionally.
            </p>
          )}
        </div>

        <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
          Set aside now: <strong className="font-mono">Fr. {fmtR(progress.current)}</strong>
          {" · "}grows <strong className="font-mono">Fr. {fmtR(progress.monthly)}</strong>/month
          {draft.target > 0 && <> · {Math.min(100, progress.current / draft.target * 100).toFixed(0)}% of the target</>}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-2">
          {draft.id != null && (
            <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={remove}>
              <Trash2 className="size-4" /> Delete
            </Button>
          )}
          <Button variant="outline" className="ml-auto" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !draft.name.trim()} onClick={save}>{draft.id == null ? "Add goal" : "Save"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
