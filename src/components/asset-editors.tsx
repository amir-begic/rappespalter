"use client"

import { useState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { AssetArt } from "@/components/asset-art"
import { useT } from "@/lib/i18n/provider"
import { COLLECTION_LABEL } from "@/lib/i18n/labels"
import {
  ASSET_KINDS, COLLECTIBLE_TYPES, LIABILITY_KINDS, paymentOf,
  type Asset, type AssetKind, type Liability, type LiabilityKind,
} from "@/lib/assets"

// Dialogs to add / edit an asset or a loan / lease (Wealth → Assets). Rates are
// entered as percentages and stored as shares (4.9% → 0.049).

const selectClass = "h-9 w-full rounded-xl border border-input bg-card px-2 text-sm text-foreground"

export const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const num = (v: string) => v === "" ? null : Number(v)
const pct = (share: number | null) => share == null ? "" : String(Math.round(share * 10000) / 100)
const share = (v: string) => v === "" ? null : Number(v) / 100

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  )
}

// Throws the server's message, or an empty one when it sent none (callers show a
// translated fallback).
async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method, headers: { "Content-Type": "application/json" }, body: body == null ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? "")
  return data
}

// ── Asset ────────────────────────────────────────────────────────────────────

export type AssetDraft = Omit<Asset, "id" | "values"> & { id: number | null; value: number | null }

export function newAssetDraft(kind: AssetKind, name: string): AssetDraft {
  const info = ASSET_KINDS[kind]
  return {
    id: null, kind, name, subtype: kind === "collectible" ? COLLECTIBLE_TYPES[0] : null,
    valuation: info.valuation, quantity: null, unit: info.units[0] ?? null,
    purchaseDate: info.valuation === "depreciation" ? todayKey() : null, purchasePrice: null,
    depreciationRate: info.valuation === "depreciation" ? info.depreciation : null, residualValue: null,
    soldDate: null, soldPrice: null, costCategories: [], notes: null, value: null,
  }
}

export const assetDraftOf = (a: Asset): AssetDraft => ({ ...a, value: null })

export function AssetEditor({ draft, onChange, onClose, onSaved, onDeleted }: {
  draft: AssetDraft
  onChange: (d: AssetDraft) => void; onClose: () => void
  onSaved: (id: number) => void; onDeleted?: () => void
}) {
  const { t } = useT()
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<AssetDraft>) => onChange({ ...draft, ...patch })
  const info = ASSET_KINDS[draft.kind]
  const failure = (e: unknown, fallback: string) => e instanceof Error && e.message ? e.message : fallback
  const depreciates = draft.valuation === "depreciation"
  const isNew = draft.id == null

  function switchKind(kind: AssetKind) {
    const next = newAssetDraft(kind, t(`as.kind.${kind}.name`))
    set({
      kind, subtype: next.subtype, unit: next.unit, valuation: next.valuation,
      depreciationRate: next.depreciationRate,
      purchaseDate: draft.purchaseDate ?? next.purchaseDate,
      ...(draft.name === t(`as.kind.${draft.kind}.name`) ? { name: next.name } : {}),
    })
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const { id } = await send("/api/assets", isNew ? "POST" : "PUT", { ...draft, valueDate: todayKey() })
      onSaved(id)
    } catch (e) {
      setError(failure(e, t("common.saveFailed")))
      setBusy(false)
    }
  }

  async function remove() {
    if (draft.id == null || !window.confirm(t("as.edit.deleteConfirm", { name: draft.name }))) return
    setBusy(true)
    try {
      await send(`/api/assets?id=${draft.id}`, "DELETE")
      onDeleted?.()
    } catch (e) {
      setError(failure(e, t("as.edit.deleteFailed")))
      setBusy(false)
    }
  }

  const missingValue = isNew && !depreciates && draft.value == null && draft.purchasePrice == null

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? t("as.edit.newTitle") : t("as.edit.editTitle")}</DialogTitle>
          <DialogDescription>{t(`as.kind.${draft.kind}.hint`)}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-5 gap-1">
          {(Object.keys(ASSET_KINDS) as AssetKind[]).map(kind => (
            <button
              key={kind}
              type="button"
              title={t(`as.kind.${kind}.label`)}
              aria-pressed={draft.kind === kind}
              onClick={() => switchKind(kind)}
              className={`rounded-xl p-1 transition-opacity ${draft.kind === kind ? "bg-accent" : "opacity-50 hover:opacity-100"}`}
            >
              <AssetArt kind={kind} subtype={kind === draft.kind ? draft.subtype : null} className="size-full" />
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("as.edit.name")} className={draft.kind === "collectible" ? "" : "sm:col-span-2"}>
            <Input value={draft.name} maxLength={60} onChange={e => set({ name: e.target.value })} className="h-9" />
          </Field>
          {draft.kind === "collectible" && (
            <Field label={t("as.edit.collection")}>
              <select value={draft.subtype ?? ""} onChange={e => set({ subtype: e.target.value })} className={selectClass}>
                {COLLECTIBLE_TYPES.map(c => <option key={c} value={c}>{COLLECTION_LABEL[c] ? t(COLLECTION_LABEL[c]) : c}</option>)}
              </select>
            </Field>
          )}

          {info.units.length > 0 && (
            <Field label={t("as.edit.quantity")} className="sm:col-span-2">
              <div className="flex gap-2">
                <Input
                  type="number" min={0} step="any" value={draft.quantity ?? ""}
                  onChange={e => set({ quantity: num(e.target.value) })} className="h-9"
                />
                <select value={draft.unit ?? ""} onChange={e => set({ unit: e.target.value })} className={`${selectClass} w-28`} aria-label={t("as.edit.unit")}>
                  {info.units.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </Field>
          )}

          <Field label={t("as.edit.boughtOn")} hint={depreciates ? undefined : t("as.edit.boughtHint")}>
            <Input type="date" value={draft.purchaseDate ?? ""} onChange={e => set({ purchaseDate: e.target.value || null })} className="h-9" />
          </Field>
          <Field label={t("as.edit.paid")} hint={depreciates ? undefined : t("as.edit.paidHint")}>
            <Input
              type="number" min={0} step={100} value={draft.purchasePrice ?? ""}
              onChange={e => set({ purchasePrice: num(e.target.value) })} className="h-9"
            />
          </Field>

          <Field label={t("as.edit.value")} className="sm:col-span-2">
            <select
              value={draft.valuation}
              onChange={e => {
                const v = e.target.value as AssetDraft["valuation"]
                set({ valuation: v, depreciationRate: v === "depreciation" ? draft.depreciationRate ?? (info.depreciation || 0.15) : null })
              }}
              className={selectClass}
            >
              <option value="manual">{t("as.edit.valueManual")}</option>
              <option value="depreciation">{t("as.edit.valueDepreciation")}</option>
            </select>
          </Field>

          {depreciates ? (
            <>
              <Field label={t("as.edit.losesYear")} hint={t("as.edit.losesHint")}>
                <Input
                  type="number" min={0} max={99} step={1} value={pct(draft.depreciationRate)}
                  onChange={e => set({ depreciationRate: share(e.target.value) })} className="h-9"
                />
              </Field>
              <Field label={t("as.edit.neverBelow")} hint={t("as.edit.neverBelowHint")}>
                <Input
                  type="number" min={0} step={100} value={draft.residualValue ?? ""}
                  onChange={e => set({ residualValue: num(e.target.value) })} className="h-9"
                />
              </Field>
            </>
          ) : isNew && (
            <Field label={t("as.edit.worthToday")} className="sm:col-span-2" hint={t("as.edit.worthTodayHint")}>
              <Input
                type="number" min={0} step={10} value={draft.value ?? ""}
                onChange={e => set({ value: num(e.target.value) })} className="h-9"
              />
            </Field>
          )}

          {!isNew && (
            <>
              <Field label={t("as.edit.soldOn")}>
                <Input type="date" value={draft.soldDate ?? ""} onChange={e => set({ soldDate: e.target.value || null })} className="h-9" />
              </Field>
              <Field label={t("as.edit.soldFor")}>
                <Input
                  type="number" min={0} step={100} value={draft.soldPrice ?? ""} disabled={!draft.soldDate}
                  onChange={e => set({ soldPrice: num(e.target.value) })} className="h-9"
                />
              </Field>
            </>
          )}

          <Field label={t("as.edit.notes")} className="sm:col-span-2">
            <Input value={draft.notes ?? ""} maxLength={500} onChange={e => set({ notes: e.target.value || null })} className="h-9" />
          </Field>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-2">
          {!isNew && (
            <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={remove}>
              <Trash2 className="size-4" /> {t("common.delete")}
            </Button>
          )}
          <Button variant="outline" className="ml-auto" disabled={busy} onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            disabled={busy || !draft.name.trim() || missingValue || (depreciates && (!draft.purchaseDate || draft.purchasePrice == null))}
            onClick={save}
          >
            {isNew ? t("as.edit.add") : t("common.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Loan / lease ─────────────────────────────────────────────────────────────

export type LiabilityDraft = Omit<Liability, "id"> & { id: number | null }

export function newLiabilityDraft(kind: LiabilityKind, name: string, asset?: Asset): LiabilityDraft {
  return {
    id: null, kind, assetId: asset?.id ?? null, name,
    principal: kind === "lease" ? asset?.purchasePrice ?? 0 : 0,
    rate: 0, startDate: asset?.purchaseDate ?? todayKey(), termMonths: kind === "mortgage" ? null : 48,
    monthlyPayment: null, balloon: 0, balance: null, balanceDate: null, counterparty: null, notes: null,
  }
}

export function LiabilityEditor({ draft, assets, onChange, onClose, onSaved }: {
  draft: LiabilityDraft; assets: Asset[]
  onChange: (d: LiabilityDraft) => void; onClose: () => void; onSaved: () => void
}) {
  const { t, f } = useT()
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<LiabilityDraft>) => onChange({ ...draft, ...patch })
  const failure = (e: unknown, fallback: string) => e instanceof Error && e.message ? e.message : fallback
  const lease = draft.kind === "lease"
  const isNew = draft.id == null
  const preview = paymentOf({ ...draft, id: draft.id ?? -1 })

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await send("/api/liabilities", isNew ? "POST" : "PUT", draft)
      onSaved()
    } catch (e) {
      setError(failure(e, t("common.saveFailed")))
      setBusy(false)
    }
  }

  async function remove() {
    if (draft.id == null || !window.confirm(t("as.liab.deleteConfirm", { name: draft.name }))) return
    setBusy(true)
    try {
      await send(`/api/liabilities?id=${draft.id}`, "DELETE")
      onSaved()
    } catch (e) {
      setError(failure(e, t("as.edit.deleteFailed")))
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? t(`as.liab.new.${draft.kind}`) : t(`as.liab.edit.${draft.kind}`)}</DialogTitle>
          <DialogDescription>{t(`as.liabKind.${draft.kind}.hint`)}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("as.liab.kindAria")}>
          {(Object.keys(LIABILITY_KINDS) as LiabilityKind[]).map(k => (
            <Button
              key={k} size="sm" variant={draft.kind === k ? "default" : "outline"}
              role="radio" aria-checked={draft.kind === k}
              onClick={() => set({ kind: k, ...(k === "mortgage" && isNew ? { termMonths: null } : {}) })}
            >
              {t(`as.liabKind.${k}.label`)}
            </Button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("as.edit.name")}>
            <Input value={draft.name} maxLength={60} onChange={e => set({ name: e.target.value })} className="h-9" />
          </Field>
          <Field label={lease ? t("as.liab.vehicle") : t("as.liab.for")}>
            <select
              value={draft.assetId ?? ""}
              onChange={e => set({ assetId: e.target.value ? Number(e.target.value) : null })}
              className={selectClass}
            >
              <option value="">—</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>

          <Field label={t("as.liab.startedOn")} hint={t("as.liab.startedHint")}>
            <Input type="date" value={draft.startDate} onChange={e => set({ startDate: e.target.value })} className="h-9" />
          </Field>
          <Field label={lease ? t("as.liab.term") : t("as.liab.termOptional")} hint={lease ? undefined : t("as.liab.termHint")}>
            <Input
              type="number" min={1} step={1} value={draft.termMonths ?? ""}
              onChange={e => set({ termMonths: num(e.target.value) })} className="h-9"
            />
          </Field>

          <Field label={lease ? t("as.liab.vehiclePrice") : t("as.liab.borrowed")} hint={lease ? t("as.liab.vehiclePriceHint") : undefined}>
            <Input
              type="number" min={0} step={100} value={draft.principal || ""}
              onChange={e => set({ principal: num(e.target.value) ?? 0 })} className="h-9"
            />
          </Field>
          {!lease && (
            <Field label={t("as.liab.interestYear")}>
              <Input
                type="number" min={0} max={99} step={0.1} value={pct(draft.rate)}
                onChange={e => set({ rate: share(e.target.value) ?? 0 })} className="h-9"
              />
            </Field>
          )}

          <Field
            label={lease ? t("as.liab.payment") : t("as.liab.paymentOptional")}
            hint={lease ? undefined : preview > 0 ? t("as.liab.workOutAmount", { amount: f.int(preview) }) : t("as.liab.workOut")}
          >
            <Input
              type="number" min={0} step={10} value={draft.monthlyPayment ?? ""}
              onChange={e => set({ monthlyPayment: num(e.target.value) })} className="h-9"
            />
          </Field>
          <Field label={lease ? t("as.liab.buyoutPrice") : t("as.liab.finalPaymentLabel")} hint={lease ? t("as.liab.buyoutHint") : t("as.liab.finalPaymentHint")}>
            <Input
              type="number" min={0} step={100} value={draft.balloon || ""}
              onChange={e => set({ balloon: num(e.target.value) ?? 0 })} className="h-9"
            />
          </Field>

          {!lease && (
            <>
              <Field label={t("as.liab.statement")} hint={t("as.liab.statementHint")}>
                <Input
                  type="number" min={0} step={100} value={draft.balance ?? ""}
                  onChange={e => {
                    const balance = num(e.target.value)
                    set({ balance, balanceDate: balance == null ? null : draft.balanceDate ?? todayKey() })
                  }}
                  className="h-9"
                />
              </Field>
              <Field label={t("as.liab.balanceOn")}>
                <Input
                  type="date" value={draft.balanceDate ?? ""} disabled={draft.balance == null}
                  onChange={e => set({ balanceDate: e.target.value || null })} className="h-9"
                />
              </Field>
            </>
          )}

          <Field label={t("as.liab.payee")} className="sm:col-span-2" hint={t("as.liab.payeeHint")}>
            <Input value={draft.counterparty ?? ""} maxLength={60} placeholder={t("as.liab.payeePlaceholder")} onChange={e => set({ counterparty: e.target.value || null })} className="h-9" />
          </Field>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-2">
          {!isNew && (
            <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={remove}>
              <Trash2 className="size-4" /> {t("common.delete")}
            </Button>
          )}
          <Button variant="outline" className="ml-auto" disabled={busy} onClick={onClose}>{t("common.cancel")}</Button>
          <Button disabled={busy || !draft.name.trim() || !draft.startDate} onClick={save}>{isNew ? t("as.liab.add") : t("common.save")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
