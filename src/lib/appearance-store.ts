import { prisma } from "@/lib/prisma"
import { APPEARANCE_KEYS, DEFAULT_APPEARANCE, isMotion, isTheme, type Appearance } from "@/lib/appearance"

// Reads the saved appearance, falling back to the defaults for anything missing or
// unreadable (the page must render even if the database can't be reached).
export async function loadAppearance(): Promise<Appearance> {
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { in: Object.values(APPEARANCE_KEYS) } },
    })
    const get = (key: string) => rows.find(r => r.key === key)?.value
    const theme = get(APPEARANCE_KEYS.theme)
    const motion = get(APPEARANCE_KEYS.motion)
    return {
      theme: isTheme(theme) ? theme : DEFAULT_APPEARANCE.theme,
      motion: isMotion(motion) ? motion : DEFAULT_APPEARANCE.motion,
    }
  } catch (error) {
    console.error("Appearance load error:", error)
    return DEFAULT_APPEARANCE
  }
}

export async function saveAppearance(change: Partial<Appearance>) {
  const entries = Object.entries(change).filter(([, v]) => v !== undefined) as [keyof Appearance, string][]
  await prisma.$transaction(
    entries.map(([field, value]) =>
      prisma.setting.upsert({
        where: { key: APPEARANCE_KEYS[field] },
        update: { value },
        create: { key: APPEARANCE_KEYS[field], value },
      })
    )
  )
  return loadAppearance()
}
