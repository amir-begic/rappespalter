import { prisma } from "@/lib/prisma"
import { ensureSettingTable } from "@/lib/setting-table"
import { BIRTH_DATE_KEY, DEFAULT_AGE, LEGACY_AGE_KEY, ageOn, isBirthDate } from "@/lib/settings"
import { parseProfile, type TaxEstimate, type TaxProfile } from "@/lib/tax-estimate"

// The tax profile and the last estimate per year, in the Setting table.
const PROFILE_KEY = "tax.profile"
const estimateKey = (year: number) => `tax.estimate.${year}`

const readJson = (value: string | undefined) => {
  if (value == null) return null
  try { return JSON.parse(value) } catch { return null }
}

async function put(key: string, value: unknown) {
  await ensureSettingTable()
  const json = JSON.stringify(value)
  await prisma.setting.upsert({ where: { key }, update: { value: json }, create: { key, value: json } })
}

export async function loadTaxProfile(): Promise<TaxProfile> {
  await ensureSettingTable()
  const row = await prisma.setting.findUnique({ where: { key: PROFILE_KEY } })
  return parseProfile(readJson(row?.value))
}

export const saveTaxProfile = (profile: TaxProfile) => put(PROFILE_KEY, profile)

export async function loadTaxEstimate(year: number): Promise<TaxEstimate | null> {
  await ensureSettingTable()
  const row = await prisma.setting.findUnique({ where: { key: estimateKey(year) } })
  const e = readJson(row?.value)
  return e?.request && e?.location && e?.result?.income && typeof e?.at === "string" ? e : null
}

export const saveTaxEstimate = (estimate: TaxEstimate) => put(estimateKey(estimate.request.year), estimate)

/** Age on 31 December of the tax year, from the birth date (else the old age setting). */
export async function ageAtYearEnd(year: number): Promise<number> {
  await ensureSettingTable()
  const rows = await prisma.setting.findMany({ where: { key: { in: [BIRTH_DATE_KEY, LEGACY_AGE_KEY] } } })
  const birthDate = rows.find(r => r.key === BIRTH_DATE_KEY)?.value
  if (isBirthDate(birthDate)) return ageOn(birthDate, new Date(year, 11, 31))
  const legacy = Number(rows.find(r => r.key === LEGACY_AGE_KEY)?.value)
  return (Number.isFinite(legacy) ? legacy : DEFAULT_AGE) - (new Date().getFullYear() - year)
}
