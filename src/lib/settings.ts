// User-editable settings, persisted in the Setting table and edited on /settings.
// The NEXT_PUBLIC_* env vars only provide the initial defaults: they are inlined
// at build time, so in the packaged desktop app they can't be changed without a
// rebuild — anything saved in the GUI takes precedence.

const num = (v: string | undefined, fallback: number) =>
  v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : fallback

export const isBirthDate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))

// Numeric settings (CHF amounts).
export const SETTING_FIELDS = [
  { key: "monthlyEtf",     label: "ETF",             group: "monthly", default: num(process.env.NEXT_PUBLIC_MONTHLY_ETF, 0) },
  { key: "monthly3a",      label: "Säule 3a",        group: "monthly", default: num(process.env.NEXT_PUBLIC_MONTHLY_3A, 0) },
  { key: "monthlyPillar2", label: "2. Säule",        group: "monthly", default: num(process.env.NEXT_PUBLIC_MONTHLY_PILLAR2, 0) },
  { key: "initEtf",        label: "ETF portfolio",   group: "initial", default: num(process.env.NEXT_PUBLIC_INIT_ETF, 0) },
  { key: "initSavings",    label: "Savings account", group: "initial", default: num(process.env.NEXT_PUBLIC_INIT_SAVINGS, 0) },
  { key: "initPillar3a",   label: "Säule 3a",        group: "initial", default: num(process.env.NEXT_PUBLIC_INIT_PILLAR3A, 0) },
  { key: "initPillar2",    label: "2. Säule",        group: "initial", default: num(process.env.NEXT_PUBLIC_INIT_PILLAR2, 0) },
] as const

export type SettingKey = (typeof SETTING_FIELDS)[number]["key"]

// Plus the birth date (YYYY-MM-DD), which places the forecast on an age axis and
// ends it at retirement. It replaced a "current age" number (Setting "startAge"):
// without a saved birth date, one is estimated from that age as 1 January of the
// birth year, and flagged so the Settings page asks for the real one.
export type Settings = Record<SettingKey, number> & { birthDate: string | null }

export const BIRTH_DATE_KEY = "birthDate"
export const LEGACY_AGE_KEY = "startAge"

const envBirthDate = process.env.NEXT_PUBLIC_BIRTH_DATE
export const DEFAULT_SETTINGS: Settings = {
  ...(Object.fromEntries(SETTING_FIELDS.map(f => [f.key, f.default])) as Record<SettingKey, number>),
  birthDate: isBirthDate(envBirthDate) ? envBirthDate : null,
}

// Fallback age when nothing else is known (also the old NEXT_PUBLIC_START_AGE).
export const DEFAULT_AGE = num(process.env.NEXT_PUBLIC_START_AGE, 30)

export const isSettingKey = (k: string): k is SettingKey =>
  SETTING_FIELDS.some(f => f.key === k)

export function estimateBirthDate(age: number, today = new Date()) {
  return `${today.getFullYear() - Math.round(age)}-01-01`
}

// Age in whole years on `date`.
export function ageOn(birthDate: string, date = new Date()) {
  const [y, m, d] = birthDate.split("-").map(Number)
  let age = date.getFullYear() - y
  if (date.getMonth() + 1 < m || (date.getMonth() + 1 === m && date.getDate() < d)) age--
  return age
}
