import { prisma } from "@/lib/prisma"
import { isAssetKind, isLiabilityKind, type Asset, type Liability } from "@/lib/assets"

export async function loadAssets(): Promise<Asset[]> {
  const rows = await prisma.asset.findMany({
    include: { values: { orderBy: [{ date: "asc" }, { id: "asc" }] } },
    orderBy: { id: "asc" },
  })
  return rows.map(a => ({
    id:               a.id,
    name:             a.name,
    kind:             isAssetKind(a.kind) ? a.kind : "other",
    subtype:          a.subtype,
    valuation:        a.valuation === "depreciation" ? "depreciation" : "manual",
    quantity:         a.quantity,
    unit:             a.unit,
    purchaseDate:     a.purchaseDate,
    purchasePrice:    a.purchasePrice,
    depreciationRate: a.depreciationRate,
    residualValue:    a.residualValue,
    soldDate:         a.soldDate,
    soldPrice:        a.soldPrice,
    costCategories:   parseIds(a.costCategories),
    notes:            a.notes,
    values:           a.values.map(v => ({ id: v.id, date: v.date, value: v.value })),
  }))
}

export async function loadLiabilities(): Promise<Liability[]> {
  const rows = await prisma.liability.findMany({ orderBy: { id: "asc" } })
  return rows.map(l => ({
    id:             l.id,
    name:           l.name,
    kind:           isLiabilityKind(l.kind) ? l.kind : "other",
    assetId:        l.assetId,
    principal:      l.principal,
    rate:           l.rate,
    startDate:      l.startDate,
    termMonths:     l.termMonths,
    monthlyPayment: l.monthlyPayment,
    balloon:        l.balloon,
    balance:        l.balance,
    balanceDate:    l.balanceDate,
    counterparty:   l.counterparty,
    notes:          l.notes,
  }))
}

function parseIds(raw: string | null): number[] {
  if (!raw) return []
  try {
    const ids = JSON.parse(raw)
    return Array.isArray(ids) ? ids.filter(Number.isInteger) : []
  } catch {
    return []
  }
}
