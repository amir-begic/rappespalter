"use client"

import { useState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { AssetArt } from "@/components/asset-art"
import {
  ASSET_KINDS, COLLECTIBLE_TYPES, LIABILITY_KINDS, paymentOf,
  type Asset, type AssetKind, type Liability, type LiabilityKind,
} from "@/lib/assets"

// Dialogs to add / edit an asset or a loan / lease (Wealth → Assets). Rates are
// entered as percentages and stored as shares (4.9% → 0.049).

const fmtR = (n: number) => Math.round(n).toLocaleString("de-CH")
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

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method, headers: { "Content-Type": "application/json" }, body: body == null ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? "Failed to save")
  return data
}

// ── Asset ────────────────────────────────────────────────────────────────────

export type AssetDraft = Omit<Asset, "id" | "values"> & { id: number | null; value: number | null }

export function newAssetDraft(kind: AssetKind): AssetDraft {
  const info = ASSET_KINDS[kind]
  return {
    id: null, kind, name: info.name, subtype: kind === "collectible" ? COLLECTIBLE_TYPES[0] : null,
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
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<AssetDraft>) => onChange({ ...draft, ...patch })
  const info = ASSET_KINDS[draft.kind]
  const depreciates = draft.valuation === "depreciation"
  const isNew = draft.id == null

  function switchKind(kind: AssetKind) {
    const next = newAssetDraft(kind)
    set({
      kind, subtype: next.subtype, unit: next.unit, valuation: next.valuation,
      depreciationRate: next.depreciationRate,
      purchaseDate: draft.purchaseDate ?? next.purchaseDate,
      ...(draft.name === ASSET_KINDS[draft.kind].name ? { name: next.name } : {}),
    })
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const { id } = await send("/api/assets", isNew ? "POST" : "PUT", { ...draft, valueDate: todayKey() })
      onSaved(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save")
      setBusy(false)
    }
  }

  async function remove() {
    if (draft.id == null || !window.confirm(`Delete “${draft.name}” and its valuations? Loans against it are kept.`)) return
    setBusy(true)
    try {
      await send(`/api/assets?id=${draft.id}`, "DELETE")
      onDeleted?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete")
      setBusy(false)
    }
  }

  const missingValue = isNew && !depreciates && draft.value == null && draft.purchasePrice == null

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "New asset" : "Edit asset"}</DialogTitle>
          <DialogDescription>{info.hint}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-5 gap-1">
          {(Object.keys(ASSET_KINDS) as AssetKind[]).map(kind => (
            <button
              key={kind}
              type="button"
              title={ASSET_KINDS[kind].label}
              aria-pressed={draft.kind === kind}
              onClick={() => switchKind(kind)}
              className={`rounded-xl p-1 transition-opacity ${draft.kind === kind ? "bg-accent" : "opacity-50 hover:opacity-100"}`}
            >
              <AssetArt kind={kind} subtype={kind === draft.kind ? draft.subtype : null} className="size-full" />
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" className={draft.kind === "collectible" ? "" : "sm:col-span-2"}>
            <Input value={draft.name} maxLength={60} onChange={e => set({ name: e.target.value })} className="h-9" />
          </Field>
          {draft.kind === "collectible" && (
            <Field label="Collection">
              <select value={draft.subtype ?? ""} onChange={e => set({ subtype: e.target.value })} className={selectClass}>
                {COLLECTIBLE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
          )}

          {info.units.length > 0 && (
            <Field label="Quantity (optional)" className="sm:col-span-2">
              <div className="flex gap-2">
                <Input
                  type="number" min={0} step="any" value={draft.quantity ?? ""}
                  onChange={e => set({ quantity: num(e.target.value) })} className="h-9"
                />
                <select value={draft.unit ?? ""} onChange={e => set({ unit: e.target.value })} className={`${selectClass} w-28`} aria-label="Unit">
                  {info.units.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </Field>
          )}

          <Field label="Bought on" hint={depreciates ? undefined : "Optional — its value counts from this day."}>
            <Input type="date" value={draft.purchaseDate ?? ""} onChange={e => set({ purchaseDate: e.target.value || null })} className="h-9" />
          </Field>
          <Field label="Paid (Fr.)" hint={depreciates ? undefined : "Optional — shows the gain since."}>
            <Input
              type="number" min={0} step={100} value={draft.purchasePrice ?? ""}
              onChange={e => set({ purchasePrice: num(e.target.value) })} className="h-9"
            />
          </Field>

          <Field label="Value" className="sm:col-span-2">
            <select
              value={draft.valuation}
              onChange={e => {
                const v = e.target.value as AssetDraft["valuation"]
                set({ valuation: v, depreciationRate: v === "depreciation" ? draft.depreciationRate ?? (info.depreciation || 0.15) : null })
              }}
              className={selectClass}
            >
              <option value="manual">I enter it now and then</option>
              <option value="depreciation">It loses value every year</option>
            </select>
          </Field>

          {depreciates ? (
            <>
              <Field label="Loses a year (%)" hint="Cars: about 15% a year is typical.">
                <Input
                  type="number" min={0} max={99} step={1} value={pct(draft.depreciationRate)}
                  onChange={e => set({ depreciationRate: share(e.target.value) })} className="h-9"
                />
              </Field>
              <Field label="Never below (Fr.)" hint="Optional — e.g. its scrap or trade-in value.">
                <Input
                  type="number" min={0} step={100} value={draft.residualValue ?? ""}
                  onChange={e => set({ residualValue: num(e.target.value) })} className="h-9"
                />
              </Field>
            </>
          ) : isNew && (
            <Field label="Worth today (Fr.)" className="sm:col-span-2" hint="Recorded as today's valuation; add newer ones on the asset's page.">
              <Input
                type="number" min={0} step={10} value={draft.value ?? ""}
                onChange={e => set({ value: num(e.target.value) })} className="h-9"
              />
            </Field>
          )}

          {!isNew && (
            <>
              <Field label="Sold on (optional)">
                <Input type="date" value={draft.soldDate ?? ""} onChange={e => set({ soldDate: e.target.value || null })} className="h-9" />
              </Field>
              <Field label="Sold for (Fr.)">
                <Input
                  type="number" min={0} step={100} value={draft.soldPrice ?? ""} disabled={!draft.soldDate}
                  onChange={e => set({ soldPrice: num(e.target.value) })} className="h-9"
                />
              </Field>
            </>
          )}

          <Field label="Notes (optional)" className="sm:col-span-2">
            <Input value={draft.notes ?? ""} maxLength={500} onChange={e => set({ notes: e.target.value || null })} className="h-9" />
          </Field>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-2">
          {!isNew && (
            <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={remove}>
              <Trash2 className="size-4" /> Delete
            </Button>
          )}
          <Button variant="outline" className="ml-auto" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy || !draft.name.trim() || missingValue || (depreciates && (!draft.purchaseDate || draft.purchasePrice == null))}
            onClick={save}
          >
            {isNew ? "Add asset" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Loan / lease ─────────────────────────────────────────────────────────────

export type LiabilityDraft = Omit<Liability, "id"> & { id: number | null }

export function newLiabilityDraft(kind: LiabilityKind, asset?: Asset): LiabilityDraft {
  return {
    id: null, kind, assetId: asset?.id ?? null,
    name: asset ? `${asset.name} ${LIABILITY_KINDS[kind].label.toLowerCase()}` : LIABILITY_KINDS[kind].label,
    principal: kind === "lease" ? asset?.purchasePrice ?? 0 : 0,
    rate: 0, startDate: asset?.purchaseDate ?? todayKey(), termMonths: kind === "mortgage" ? null : 48,
    monthlyPayment: null, balloon: 0, balance: null, balanceDate: null, counterparty: null, notes: null,
  }
}

export function LiabilityEditor({ draft, assets, onChange, onClose, onSaved }: {
  draft: LiabilityDraft; assets: Asset[]
  onChange: (d: LiabilityDraft) => void; onClose: () => void; onSaved: () => void
}) {
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<LiabilityDraft>) => onChange({ ...draft, ...patch })
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
      setError(e instanceof Error ? e.message : "Failed to save")
      setBusy(false)
    }
  }

  async function remove() {
    if (draft.id == null || !window.confirm(`Delete “${draft.name}”?`)) return
    setBusy(true)
    try {
      await send(`/api/liabilities?id=${draft.id}`, "DELETE")
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete")
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? `New ${LIABILITY_KINDS[draft.kind].label.toLowerCase()}` : `Edit ${LIABILITY_KINDS[draft.kind].label.toLowerCase()}`}</DialogTitle>
          <DialogDescription>{LIABILITY_KINDS[draft.kind].hint}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kind">
          {(Object.keys(LIABILITY_KINDS) as LiabilityKind[]).map(k => (
            <Button
              key={k} size="sm" variant={draft.kind === k ? "default" : "outline"}
              role="radio" aria-checked={draft.kind === k}
              onClick={() => set({ kind: k, ...(k === "mortgage" && isNew ? { termMonths: null } : {}) })}
            >
              {LIABILITY_KINDS[k].label}
            </Button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={draft.name} maxLength={60} onChange={e => set({ name: e.target.value })} className="h-9" />
          </Field>
          <Field label={lease ? "Vehicle" : "For (optional)"}>
            <select
              value={draft.assetId ?? ""}
              onChange={e => set({ assetId: e.target.value ? Number(e.target.value) : null })}
              className={selectClass}
            >
              <option value="">—</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>

          <Field label="Started on" hint="The first payment is due a month later.">
            <Input type="date" value={draft.startDate} onChange={e => set({ startDate: e.target.value })} className="h-9" />
          </Field>
          <Field label={lease ? "Term (months)" : "Term (months, optional)"} hint={lease ? undefined : "Leave empty if it has no end."}>
            <Input
              type="number" min={1} step={1} value={draft.termMonths ?? ""}
              onChange={e => set({ termMonths: num(e.target.value) })} className="h-9"
            />
          </Field>

          <Field label={lease ? "Vehicle price (Fr.)" : "Amount borrowed (Fr.)"} hint={lease ? "Optional — shows the lease's effective interest." : undefined}>
            <Input
              type="number" min={0} step={100} value={draft.principal || ""}
              onChange={e => set({ principal: num(e.target.value) ?? 0 })} className="h-9"
            />
          </Field>
          {!lease && (
            <Field label="Interest a year (%)">
              <Input
                type="number" min={0} max={99} step={0.1} value={pct(draft.rate)}
                onChange={e => set({ rate: share(e.target.value) ?? 0 })} className="h-9"
              />
            </Field>
          )}

          <Field
            label={lease ? "Monthly payment (Fr.)" : "Monthly payment (Fr., optional)"}
            hint={lease ? undefined : `Leave empty to work it out${preview > 0 ? ` — Fr. ${fmtR(preview)}` : ""}.`}
          >
            <Input
              type="number" min={0} step={10} value={draft.monthlyPayment ?? ""}
              onChange={e => set({ monthlyPayment: num(e.target.value) })} className="h-9"
            />
          </Field>
          <Field label={lease ? "Buyout price (Fr.)" : "Final payment (Fr.)"} hint={lease ? "Optional — the residual value in the contract." : "Optional — a balloon payment at the end."}>
            <Input
              type="number" min={0} step={100} value={draft.balloon || ""}
              onChange={e => set({ balloon: num(e.target.value) ?? 0 })} className="h-9"
            />
          </Field>

          {!lease && (
            <>
              <Field label="Statement balance (Fr.)" hint="Optional — from the lender; the schedule carries on from it.">
                <Input
                  type="number" min={0} step={100} value={draft.balance ?? ""}
                  onChange={e => {
                    const balance = num(e.target.value)
                    set({ balance, balanceDate: balance == null ? null : draft.balanceDate ?? todayKey() })
                  }}
                  className="h-9"
                />
              </Field>
              <Field label="Balance on">
                <Input
                  type="date" value={draft.balanceDate ?? ""} disabled={draft.balance == null}
                  onChange={e => set({ balanceDate: e.target.value || null })} className="h-9"
                />
              </Field>
            </>
          )}

          <Field label="Payee in your bank export (optional)" className="sm:col-span-2" hint="Its payments are left out of the vehicle's running costs — they're counted as financing.">
            <Input value={draft.counterparty ?? ""} maxLength={60} placeholder="e.g. Leasing AG" onChange={e => set({ counterparty: e.target.value || null })} className="h-9" />
          </Field>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-2">
          {!isNew && (
            <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={remove}>
              <Trash2 className="size-4" /> Delete
            </Button>
          )}
          <Button variant="outline" className="ml-auto" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !draft.name.trim() || !draft.startDate} onClick={save}>{isNew ? "Add" : "Save"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
