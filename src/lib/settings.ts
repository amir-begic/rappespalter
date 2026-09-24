// User-editable settings, persisted in the Setting table and edited on /settings.
// The NEXT_PUBLIC_* env vars only provide the initial defaults: they are inlined
// at build time, so in the packaged desktop app they can't be changed without a
// rebuild — anything saved in the GUI takes precedence.

const num = (v: string | undefined, fallback: number) =>
  v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : fallback

export const SETTING_FIELDS = [
  { key: "monthlyEtf",     label: "ETF",             group: "monthly", default: num(process.env.NEXT_PUBLIC_MONTHLY_ETF, 0) },
  { key: "monthly3a",      label: "Säule 3a",        group: "monthly", default: num(process.env.NEXT_PUBLIC_MONTHLY_3A, 0) },
  { key: "monthlyPillar2", label: "2. Säule",        group: "monthly", default: num(process.env.NEXT_PUBLIC_MONTHLY_PILLAR2, 0) },
  { key: "initEtf",        label: "ETF portfolio",   group: "initial", default: num(process.env.NEXT_PUBLIC_INIT_ETF, 0) },
  { key: "initSavings",    label: "Savings account", group: "initial", default: num(process.env.NEXT_PUBLIC_INIT_SAVINGS, 0) },
  { key: "initPillar3a",   label: "Säule 3a",        group: "initial", default: num(process.env.NEXT_PUBLIC_INIT_PILLAR3A, 0) },
  { key: "initPillar2",    label: "2. Säule",        group: "initial", default: num(process.env.NEXT_PUBLIC_INIT_PILLAR2, 0) },
  { key: "startAge",       label: "Current age",     group: "profile", default: num(process.env.NEXT_PUBLIC_START_AGE, 30) },
] as const

export type SettingKey = (typeof SETTING_FIELDS)[number]["key"]
export type Settings   = Record<SettingKey, number>

export const DEFAULT_SETTINGS = Object.fromEntries(
  SETTING_FIELDS.map(f => [f.key, f.default])
) as Settings

export const isSettingKey = (k: string): k is SettingKey =>
  SETTING_FIELDS.some(f => f.key === k)
