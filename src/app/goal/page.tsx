"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, Trash2, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { PageLoading } from "@/components/page-loading"
import { useT } from "@/lib/i18n/provider"
import { ACCOUNT_LABEL } from "@/lib/i18n/labels"
import { GoalArt, goalColor } from "@/components/goal-art"
import {
  ASSETS, GOAL_KINDS, HOME_DEFAULTS, LOCKED_ASSETS, SAVINGS_TARGETS, allocate, homeTarget, progressOf, project,
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

const thisMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
const selectClass = "text-sm rounded-xl border border-input px-2 py-1.5 bg-card text-foreground"

// The house goal used to live in localStorage (lost by the desktop app on every
// launch, as it serves the UI from a new port). Moved into the database once.
const LEGACY_KEY = "rappespalter.goal"

function newDraft(kind: GoalKind, name: string): Draft {
  return {
    id: null, kind, name, targetDate: null,
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
  // An empty message means the server sent none: callers show the translated fallback.
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "")
}

export default function GoalsPage() {
  const { t, rich, f } = useT()
  const fmtMonth = f.monthLong
  // A new goal starts with its kind's name, in the language it's created in.
  const defaultName = (kind: GoalKind) => t(`goal.kind.${kind}.name`)
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
            ...newDraft("home", defaultName("home")), params, target: homeTarget(params),
            allocations: (["checking", "savings", "etf"] as const).map(asset => ({ asset, mode: "percent", value: 100 })),
          }).catch(() => {})
          return load()
        }
        setData(d)
      })
      .catch(() => setError(t("goal.loadFailed")))
  }
  // Loads once; `load` and t are only read here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [])

  const allocated = data && allocate(data.goals, data.balances)
  const now = thisMonth()

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">

      <div className="mb-8">
        <p className="text-xs uppercase text-muted-foreground mb-2">{t("nav.section.planning")}</p>
        <h1>{t("nav.page.goals")}</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {t("goal.intro")}
        </p>
      </div>

      {!data && !error && <PageLoading />}
      {error && <div className="text-sm text-destructive py-20 text-center">{error}</div>}

      {data && allocated && (
        <div className="space-y-4">

          {!data.balanceMonth && (
            <div className="rounded-lg border border-info/40 bg-info/10 px-4 py-3 text-sm">
              {rich("goal.noSnapshot", { link: text => <Link href="/projections" className="underline">{text}</Link> })}
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
                {data.goals.length ? t("goal.addAnother") : t("goal.addFirst")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {(Object.keys(GOAL_KINDS) as GoalKind[]).map(kind => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setDraft(newDraft(kind, defaultName(kind)))}
                    className="group flex flex-col items-center gap-1 rounded-xl p-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <GoalArt kind={kind} className="size-14 transition-transform group-hover:-rotate-6 group-hover:scale-105" />
                    {t(`goal.kind.${kind}.label`)}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {data.goals.length > 0 && <AssetSplit data={data} allocated={allocated} onSourceChange={load} />}

          <p className="text-xs text-muted-foreground text-center pb-4 leading-relaxed">
            {data.balanceMonth ? t("goal.footer.snapshotMonth", { month: fmtMonth(data.balanceMonth) }) : t("goal.footer.snapshotLatest")}{" "}
            {t("goal.footer.pace", {
              period: data.paceMonths.length
                ? t("goal.footer.periodRange", { from: fmtMonth(data.paceMonths[0]), to: fmtMonth(data.paceMonths.at(-1)!) })
                : t("goal.footer.periodRecent"),
            })}
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
  const { t, rich, f } = useT()
  const fmtR = f.int
  const fmtMonth = f.monthLong
  const p = project(goal, progress, now)
  const pct = goal.target > 0 ? Math.min(100, progress.current / goal.target * 100) : 0

  let status: React.ReactNode
  if (goal.target <= 0) status = t("goal.status.noTarget")
  else if (p.reached) status = <span className="text-positive">{t("goal.status.reached")}</span>
  else if (p.date) status = rich("goal.status.eta", { b: text => <strong className="font-medium">{text}</strong> }, { monthly: fmtR(progress.monthly), date: fmtMonth(p.date) })
  else status = t("goal.status.stalled")

  return (
    <Card role="group" aria-label={goal.name}>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <GoalArt kind={goal.kind} className="size-16 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase text-muted-foreground">{t(`goal.kind.${goal.kind}.label`)}</p>
            <p className="truncate text-lg">{goal.name}</p>
            <p className="text-sm text-muted-foreground font-mono">
              {rich("goal.progress", { small: text => <span className="text-xs">{text}</span> }, { current: fmtR(progress.current), target: fmtR(goal.target) })}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onEdit}>{t("common.edit")}</Button>
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
            {p.monthsLeft != null && p.monthsLeft <= 0
              ? t("goal.target.missing", { month: fmtMonth(goal.targetDate), amount: fmtR(p.remaining) })
              : t(p.onTrack ? "goal.target.onTrack" : "goal.target.behind", { month: fmtMonth(goal.targetDate), amount: fmtR(p.needed) })}
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
  const { t, f } = useT()
  const fmtR = f.int
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
        <CardTitle className="text-sm text-muted-foreground">{t("goal.split.title")}</CardTitle>
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
                <span>{t(ACCOUNT_LABEL[key])}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {t("goal.split.line", { balance: fmtR(use.balance), free: fmtR(use.free) })}
                  {data.pace[key] !== 0 && ` · ${t("goal.split.pace", { sign: data.pace[key] > 0 ? "+" : "−", amount: fmtR(Math.abs(data.pace[key])) })}`}
                </span>
              </div>
              <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-muted">
                {parts.map((part, i) => use.balance > 0 && part.amount > 0 && (
                  <div
                    key={i}
                    title={t("goal.split.barTitle", { goal: part.goal.name, amount: fmtR(part.amount) })}
                    className="h-full border-r-2 border-card last:border-r-0"
                    style={{ width: `${part.amount / use.balance * 100}%`, background: goalColor(part.goal.kind) }}
                  />
                ))}
              </div>
              {use.over && (
                <p className="mt-1 text-xs text-negative">
                  {t("goal.split.over")}
                </p>
              )}
            </div>
          )
        })}
        {data.savingsCategories.length > 0 && (
          <div className="border-t border-border pt-3 text-xs text-muted-foreground">
            <p className="mb-2">{t("goal.split.sources")}</p>
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
                    {SAVINGS_TARGETS.map(a => <option key={a.key} value={a.key}>{t(ACCOUNT_LABEL[a.key])}</option>)}
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
  const { t, rich, f } = useT()
  const fmtR = f.int
  const accountLabel = (key: AssetKey) => t(ACCOUNT_LABEL[key])
  const defaultName = (kind: GoalKind) => t(`goal.kind.${kind}.name`)
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
      setError(e instanceof Error && e.message ? e.message : t("common.saveFailed"))
      setBusy(false)
    }
  }

  async function remove() {
    if (draft.id == null || !window.confirm(t("goal.editor.deleteConfirm", { name: draft.name }))) return
    setBusy(true)
    const res = await fetch(`/api/goals?id=${draft.id}`, { method: "DELETE" })
    if (res.ok) onSaved()
    else { setError(t("goal.editor.deleteFailed")); setBusy(false) }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.id == null ? t("goal.editor.newTitle") : t("goal.editor.editTitle")}</DialogTitle>
          <DialogDescription>{t("goal.editor.desc")}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-8 gap-1">
          {(Object.keys(GOAL_KINDS) as GoalKind[]).map(kind => (
            <button
              key={kind}
              type="button"
              title={t(`goal.kind.${kind}.label`)}
              aria-pressed={draft.kind === kind}
              onClick={() => set({
                kind,
                ...(kind === "home" && !draft.params ? { params: HOME_DEFAULTS, target: homeTarget(HOME_DEFAULTS) } : {}),
                ...(kind !== "home" ? { params: null } : {}),
                ...(draft.name === defaultName(draft.kind) ? { name: defaultName(kind) } : {}),
              })}
              className={`rounded-xl p-1 transition-opacity ${draft.kind === kind ? "bg-accent" : "opacity-50 hover:opacity-100"}`}
            >
              <GoalArt kind={kind} className="size-full" />
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-xs uppercase text-muted-foreground">{t("goal.editor.name")}</span>
            <Input value={draft.name} maxLength={60} onChange={e => set({ name: e.target.value })} className="mt-1 h-9" />
          </label>

          {home ? (
            <div className="grid grid-cols-3 gap-3 sm:col-span-2">
              {([
                ["price", t("goal.editor.price"), 10000],
                ["depositPct", t("goal.editor.deposit"), 1],
                ["costsPct", t("goal.editor.costs"), 1],
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
                {t("goal.editor.homeNeeds", { amount: fmtR(draft.target) })}
              </p>
            </div>
          ) : (
            <label className="block">
              <span className="text-xs uppercase text-muted-foreground">{t("goal.editor.target")}</span>
              <Input
                type="number" min={0} step={100} value={draft.target || ""}
                onChange={e => set({ target: parseFloat(e.target.value) || 0 })}
                className="mt-1 h-9"
              />
            </label>
          )}

          <label className="block">
            <span className="text-xs uppercase text-muted-foreground">{t("goal.editor.targetDate")}</span>
            <Input
              type="month" value={draft.targetDate ?? ""}
              onChange={e => set({ targetDate: e.target.value || null })}
              className="mt-1 h-9"
            />
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase text-muted-foreground">{t("goal.editor.setAside")}</p>
          {draft.allocations.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("goal.editor.nothingYet")}</p>
          )}
          {draft.allocations.map((a, i) => (
            <div key={a.asset} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">{accountLabel(a.asset)}</span>
              <select
                value={a.mode}
                onChange={e => setLine(i, { mode: e.target.value as Allocation["mode"], value: 0 })}
                aria-label={t("goal.editor.howAria", { account: accountLabel(a.asset) })}
                className={selectClass}
              >
                <option value="percent">{t("goal.editor.percentOf")}</option>
                <option value="amount">{t("goal.editor.fixedFr")}</option>
              </select>
              <Input
                type="number" min={0} max={a.mode === "percent" ? 100 : undefined} step={a.mode === "percent" ? 5 : 100}
                value={a.value || ""}
                onChange={e => setLine(i, { value: Math.max(0, parseFloat(e.target.value) || 0) })}
                aria-label={t("goal.editor.valueAria", { account: accountLabel(a.asset) })}
                className="h-8 w-24"
              />
              <span className="w-24 text-right font-mono text-xs text-muted-foreground">{t("goal.editor.equals", { amount: fmtR(progress.lines[i]?.amount ?? 0) })}</span>
              <button type="button" aria-label={t("goal.editor.removeAria", { account: accountLabel(a.asset) })} onClick={() => set({ allocations: draft.allocations.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
          ))}
          {unused.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {unused.map(a => (
                <Button key={a.key} size="sm" variant="outline" onClick={() => set({ allocations: [...draft.allocations, { asset: a.key as AssetKey, mode: "percent", value: 100 }] })}>
                  <Plus className="size-3" /> {accountLabel(a.key)}
                </Button>
              ))}
            </div>
          )}
          {home && (
            <p className="text-xs text-muted-foreground">
              {t("goal.editor.pensionNote")}
            </p>
          )}
          {ASSETS.some(a => allocated.byAsset[a.key].over && draft.allocations.some(l => l.asset === a.key)) && (
            <p className="text-xs text-negative">
              {t("goal.editor.overNote")}
            </p>
          )}
        </div>

        <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
          {rich("goal.editor.summary", { b: text => <strong className="font-mono">{text}</strong> }, { current: fmtR(progress.current), monthly: fmtR(progress.monthly) })}
          {draft.target > 0 && <> · {t("goal.editor.ofTarget", { pct: Math.min(100, progress.current / draft.target * 100).toFixed(0) })}</>}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-2">
          {draft.id != null && (
            <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={remove}>
              <Trash2 className="size-4" /> {t("common.delete")}
            </Button>
          )}
          <Button variant="outline" className="ml-auto" disabled={busy} onClick={onClose}>{t("common.cancel")}</Button>
          <Button disabled={busy || !draft.name.trim()} onClick={save}>{draft.id == null ? t("goal.editor.add") : t("common.save")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
