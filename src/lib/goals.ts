// Savings goals (Goals page). Pure: shared by the API route and the page, so
// edits preview instantly.
//
// Assets are the snapshot balances. A goal gets parts of them: a fixed amount
// in CHF, or a percentage. Fixed amounts are set aside first; percentages apply
// to what's left of the asset. An asset can't be spent twice: fixed amounts
// beyond its balance, or percentages beyond 100%, are scaled down (and flagged).
//
// Timelines split the actual savings pace: each asset's average monthly inflow
// goes to goals by their percentage of it. Fixed amounts stay as they are.
// Investment returns are left out, so projections lean conservative.

export const ASSETS = [
  { key: "checking", label: "Checking account" },
  { key: "savings",  label: "Savings account" },
  { key: "etf",      label: "ETF portfolio" },
  { key: "pillar3a", label: "Säule 3a" },
  { key: "pillar2",  label: "2. Säule" },
] as const

export type AssetKey = (typeof ASSETS)[number]["key"]
export type AssetValues = Record<AssetKey, number>

export const isAssetKey = (v: unknown): v is AssetKey => ASSETS.some(a => a.key === v)
export const assetLabel = (k: AssetKey) => ASSETS.find(a => a.key === k)!.label
export const zeroAssets = (): AssetValues => ({ checking: 0, savings: 0, etf: 0, pillar3a: 0, pillar2: 0 })

// Pension money is locked until retirement — except, in Switzerland, for buying
// a home you live in (early withdrawal, WEF). So only home goals may use it.
export const LOCKED_ASSETS = new Set<AssetKey>(["pillar3a", "pillar2"])

export const GOAL_KINDS = {
  home:    { label: "Home",          name: "Own home" },
  travel:  { label: "Travel",        name: "Big trip" },
  wedding: { label: "Wedding",       name: "Wedding" },
  car:     { label: "Car",           name: "New car" },
  safety:  { label: "Safety net",    name: "Emergency fund" },
  study:   { label: "Education",     name: "Further education" },
  family:  { label: "Family",        name: "Family" },
  other:   { label: "Something else", name: "New goal" },
} as const

export type GoalKind = keyof typeof GOAL_KINDS
export const isGoalKind = (v: unknown): v is GoalKind => typeof v === "string" && v in GOAL_KINDS

// A home goal's target comes from the price: down payment + purchase costs.
export interface HomeParams { price: number; depositPct: number; costsPct: number }
export const HOME_DEFAULTS: HomeParams = { price: 900000, depositPct: 20, costsPct: 5 }
export const homeTarget = (p: HomeParams) => p.price * (p.depositPct + p.costsPct) / 100

export interface Allocation {
  asset: AssetKey
  mode:  "percent" | "amount"
  value: number // 0–100 for percent, CHF for amount
}

export interface Goal {
  id:          number
  name:        string
  kind:        GoalKind
  target:      number
  targetDate:  string | null // YYYY-MM
  params:      HomeParams | null
  allocations: Allocation[]
}

export interface AssetUse {
  balance:   number
  fixed:     number  // CHF set aside as fixed amounts (after scaling)
  percent:   number  // sum of percentages asked for
  allocated: number  // CHF set aside in total
  free:      number  // CHF not set aside for any goal
  over:      boolean // more was asked for than the asset holds
}

export interface GoalProgress {
  current: number                                   // CHF set aside now
  lines:   (Allocation & { amount: number })[]      // what each allocation is worth
  monthly: number                                   // CHF a month from the savings pace
}

export function allocate(goals: Goal[], balances: AssetValues) {
  const byAsset = {} as Record<AssetKey, AssetUse>
  const fixedScale = {} as Record<AssetKey, number>
  const percentScale = {} as Record<AssetKey, number>

  for (const { key } of ASSETS) {
    const balance = Math.max(0, balances[key])
    const lines = goals.flatMap(g => g.allocations.filter(a => a.asset === key))
    const fixedAsked = lines.filter(a => a.mode === "amount").reduce((s, a) => s + a.value, 0)
    const percent = lines.filter(a => a.mode === "percent").reduce((s, a) => s + a.value, 0)
    fixedScale[key] = fixedAsked > balance ? balance / fixedAsked : 1
    percentScale[key] = percent > 100 ? 100 / percent : 1
    const fixed = fixedAsked * fixedScale[key]
    const allocated = fixed + (balance - fixed) * Math.min(percent, 100) / 100
    byAsset[key] = {
      balance, fixed, percent, allocated,
      free: balance - allocated,
      over: fixedAsked > balance + 0.005 || percent > 100.0001,
    }
  }

  const amountOf = (a: Allocation) => a.mode === "amount"
    ? a.value * fixedScale[a.asset]
    : (byAsset[a.asset].balance - byAsset[a.asset].fixed) * a.value / 100 * percentScale[a.asset]

  return { byAsset, percentScale, amountOf }
}

export type Allocated = ReturnType<typeof allocate>

export function progressOf(goal: Goal, allocated: Allocated, pace: AssetValues): GoalProgress {
  const lines = goal.allocations.map(a => ({ ...a, amount: allocated.amountOf(a) }))
  const monthly = goal.allocations
    .filter(a => a.mode === "percent")
    .reduce((s, a) => s + pace[a.asset] * a.value / 100 * allocated.percentScale[a.asset], 0)
  return { current: lines.reduce((s, l) => s + l.amount, 0), lines, monthly }
}

export interface Projection {
  remaining: number
  reached:   boolean
  months:    number | null // until reached at the current pace; null if it never gets there
  date:      string | null // YYYY-MM it's reached
  // With a target date: months left and the monthly amount that would make it.
  monthsLeft: number | null
  needed:     number | null
  onTrack:    boolean | null
}

export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number)
  const i = y * 12 + (m - 1) + n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`
}

const monthsBetween = (from: string, to: string) => {
  const [fy, fm] = from.split("-").map(Number)
  const [ty, tm] = to.split("-").map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

// `now` is YYYY-MM.
export function project(goal: Goal, progress: GoalProgress, now: string): Projection {
  const remaining = Math.max(0, goal.target - progress.current)
  const reached = goal.target > 0 && remaining <= 0
  const months = reached ? 0 : progress.monthly > 0 ? Math.ceil(remaining / progress.monthly) : null
  const monthsLeft = goal.targetDate ? monthsBetween(now, goal.targetDate) : null
  const needed = monthsLeft == null || reached ? null : monthsLeft > 0 ? remaining / monthsLeft : remaining
  return {
    remaining, reached, months,
    date: months == null ? null : addMonths(now, months),
    monthsLeft, needed,
    onTrack: monthsLeft == null ? null : reached || (months != null && months <= monthsLeft),
  }
}

// ── Savings pace ────────────────────────────────────────────────────────────

export interface PaceEntry {
  month:        string // YYYY-MM
  amount:       number
  categoryType: string | null
  categoryId:   number | null
  categoryName: string | null
}

// Accounts a savings category can feed (checking is where the money leaves).
export const SAVINGS_TARGETS = ASSETS.filter(a => a.key !== "checking")

// Which asset a savings category feeds, by default from its name: "3a" → Säule
// 3a, ETF/investing → ETF, any other savings category → savings account. The
// Goals page lets the user correct it (Setting "goals.source.<categoryId>").
export function assetOfSavingsCategory(name: string | null): AssetKey {
  if (name && /3a/i.test(name)) return "pillar3a"
  if (name && /etf|invest|portfolio|depot|aktien|fonds|stock|share/i.test(name)) return "etf"
  return "savings"
}

// Average monthly inflow per asset over `months` (complete months, one-offs
// already left out). Checking gets what's left of income after spending and
// saving; the 2. Säule isn't in the bank data, so it's the monthly contribution
// from Settings.
export function savingsPace(
  entries: PaceEntry[], months: string[], pillar2Monthly: number,
  assetOf: (categoryId: number | null, name: string | null) => AssetKey =
    (_, name) => assetOfSavingsCategory(name),
): AssetValues {
  const pace = zeroAssets()
  pace.pillar2 = pillar2Monthly
  if (!months.length) return pace
  const inWindow = new Set(months)
  for (const e of entries) {
    if (!inWindow.has(e.month) || e.categoryType === "transfer") continue
    if (e.amount < 0 && e.categoryType === "savings") {
      pace[assetOf(e.categoryId, e.categoryName)] += -e.amount
    }
    pace.checking += e.amount // income in, spending and saving out
  }
  for (const k of ["checking", "savings", "etf", "pillar3a"] as const) pace[k] /= months.length
  return pace
}
