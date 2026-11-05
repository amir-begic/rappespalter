import { prisma } from "@/lib/prisma"
import { BIRTH_DATE_KEY, LEGACY_AGE_KEY, SETTING_FIELDS } from "@/lib/settings"

// First-start setup (/welcome). Its progress lives in the Setting table:
//   onboarding.state  started | done | skipped   (missing = never decided)
//   onboarding.step   the step to resume at
// With no state saved, a database that already holds anything — transactions,
// snapshots, portfolio activity, saved projection settings — belongs to someone
// who set up before this existed: it's marked done and never asked.

export const ONBOARDING_STATE = "onboarding.state"
export const ONBOARDING_STEP = "onboarding.step"
export const ONBOARDING_STATES = ["started", "done", "skipped"] as const
export type OnboardingState = (typeof ONBOARDING_STATES)[number]
export const isOnboardingState = (v: unknown): v is OnboardingState =>
  ONBOARDING_STATES.includes(v as OnboardingState)

export interface Onboarding { state: OnboardingState | null; step: number; show: boolean }

async function hasData(): Promise<boolean> {
  const [transactions, snapshots, settings] = await Promise.all([
    prisma.transaction.count(),
    prisma.snapshot.count(),
    prisma.setting.count({
      where: { key: { in: [...SETTING_FIELDS.map(f => f.key), BIRTH_DATE_KEY, LEGACY_AGE_KEY] } },
    }),
  ])
  if (transactions || snapshots || settings) return true
  return (await prisma.portfolioActivity.count()) > 0
}

export async function loadOnboarding(): Promise<Onboarding> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [ONBOARDING_STATE, ONBOARDING_STEP] } } })
  const raw = rows.find(r => r.key === ONBOARDING_STATE)?.value
  const step = Number(rows.find(r => r.key === ONBOARDING_STEP)?.value) || 0
  let state: OnboardingState | null = isOnboardingState(raw) ? raw : null
  if (state == null && await hasData()) {
    state = "done"
    await saveOnboarding({ state })
  }
  return { state, step, show: state == null || state === "started" }
}

/** Whether `/` should send the user to the setup. Never blocks the app on errors. */
export async function needsOnboarding(): Promise<boolean> {
  try {
    return (await loadOnboarding()).show
  } catch (error) {
    console.error("Onboarding check error:", error)
    return false
  }
}

export async function saveOnboarding(change: { state?: OnboardingState; step?: number }) {
  const entries: [string, string][] = []
  if (change.state) entries.push([ONBOARDING_STATE, change.state])
  if (change.step != null) entries.push([ONBOARDING_STEP, String(change.step)])
  await prisma.$transaction(entries.map(([key, value]) =>
    prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
  ))
}
