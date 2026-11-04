"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useT } from "@/lib/i18n/provider"
import {
  CHURCHES, ESTV_CALCULATOR_URL, FIRST_ESTV_YEAR, MAX_CHILDREN, RELATIONSHIPS, hasPartner, sameRequest, taxRequest,
  type TaxEstimate, type TaxLocation, type TaxProfile, type WealthLine,
} from "@/lib/tax-estimate"

export interface TaxEstimateData {
  wealth:  { lines: WealthLine[]; total: number }
  income:  number // money in booked in the year — a starting point only
  profile: TaxProfile
  age:     number
  saved:   TaxEstimate | null
}

const selectClass = "w-full text-sm rounded-xl border border-input px-3 py-2 bg-card text-foreground"
const placeName = (l: TaxLocation) => `${l.zip} ${l.city} (${l.canton})`

// ESTV's name links to its calculator, so anyone can check it's the federal administration (admin.ch).
const estvLink = (text: React.ReactNode) => (
  <a href={ESTV_CALCULATOR_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
    {text}
  </a>
)

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  )
}

function Amount({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  const { f } = useT()
  return (
    <div className={`flex items-center justify-between py-2 border-b border-border last:border-0 text-sm ${strong ? "font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="font-mono">Fr. {f.decimal(value)}</span>
    </div>
  )
}

// Search ESTV's municipalities by name or postcode; only the typed text is sent.
function PlacePicker({ value, onChange }: { value: TaxLocation | null; onChange: (l: TaxLocation) => void }) {
  const { t } = useT()
  const [editing, setEditing] = useState(value == null)
  const [query, setQuery]     = useState("")
  const [results, setResults] = useState<TaxLocation[]>([])
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    let stale = false
    const timer = setTimeout(() => {
      fetch(`/api/tax/locations?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(d => {
          if (stale) return
          setError(d.error ?? null)
          setResults(d.locations ?? [])
        })
        .catch(() => { if (!stale) setError(t("err.estv.unreachable")) })
    }, 400)
    return () => { stale = true; clearTimeout(timer) }
    // t is only read if the search fails.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  if (!editing && value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-input px-3 py-1.5 text-sm">
        <span className="truncate">{placeName(value)}</span>
        <Button variant="ghost" size="xs" onClick={() => setEditing(true)}>{t("tax.estimate.change")}</Button>
      </div>
    )
  }
  return (
    <div>
      <Input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={t("tax.estimate.placeSearch")}
        aria-label={t("tax.estimate.place")}
        autoFocus={value != null}
      />
      {error && <p className="text-xs text-negative mt-1">{error}</p>}
      {results.length > 0 && (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-input divide-y divide-border text-sm">
          {results.map(l => (
            <li key={l.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 hover:bg-accent"
                onClick={() => { onChange(l); setEditing(false); setQuery("") }}
              >
                {placeName(l)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {value && (
        <Button variant="ghost" size="xs" className="mt-1" onClick={() => setEditing(false)}>{t("common.cancel")}</Button>
      )}
    </div>
  )
}

// A whole-franc amount typed by the user, or null while it isn't one.
function parseAmount(text: string): number | null {
  const n = Number(text)
  return text.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null
}

function AmountField({ label, value, onChange, suggested }: {
  label: string; value: string; onChange: (v: string) => void; suggested?: number
}) {
  const { t } = useT()
  // Not a <label> around everything: the Reset button would become part of the field's name.
  return (
    <div>
      <span className="block text-xs uppercase text-muted-foreground mb-1">{label}</span>
      <div className="flex items-center gap-2">
        <Input
          type="number" min={0} step={1000} inputMode="numeric"
          value={value}
          onChange={e => onChange(e.target.value)}
          aria-label={label}
          aria-invalid={parseAmount(value) == null}
        />
        {suggested != null && Number(value) !== suggested && (
          <Button variant="ghost" size="xs" onClick={() => onChange(String(suggested))}>{t("tax.estimate.reset")}</Button>
        )}
      </div>
    </div>
  )
}

// Taxable wealth on 31 December and, on request, income and wealth tax from the
// ESTV calculator. Every amount is editable; it's an estimate. Remount per year
// (key) so the amounts and estimate start fresh.
export function TaxEstimateCard({ year, data }: { year: number; data: TaxEstimateData }) {
  const { t, rich, f } = useT()
  const saved = data.saved?.request
  const [profile, setProfile]   = useState(data.profile)
  // The amounts last estimated with (they may include what the app doesn't know); Reset offers the app's figure.
  const [income, setIncome]               = useState(String(saved?.income ?? data.income))
  const [partnerIncome, setPartnerIncome] = useState(String(saved?.partnerIncome ?? 0))
  const [wealth, setWealth]               = useState(String(saved?.wealth ?? data.wealth.total))
  const [estimate, setEstimate] = useState(data.saved)
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const amounts = { income: parseAmount(income), partnerIncome: parseAmount(partnerIncome), wealth: parseAmount(wealth) }
  const valid = amounts.income != null && amounts.wealth != null && (!hasPartner(profile) || amounts.partnerIncome != null)
  const request = valid
    ? taxRequest(profile, year, data.age, { income: amounts.income!, partnerIncome: amounts.partnerIncome ?? 0, wealth: amounts.wealth! })
    : null
  const upToDate = estimate != null && request != null && sameRequest(estimate.request, request)
  const supported = year >= FIRST_ESTV_YEAR

  const save = (change: Partial<TaxProfile>) => {
    const next = { ...profile, ...change }
    setProfile(next)
    setError(null)
    fetch("/api/tax/profile", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile: next }),
    })
      .then(r => { if (!r.ok) throw new Error() })
      .catch(() => setError(t("common.saveFailed")))
  }

  const calculate = async () => {
    if (!request) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/tax/estimate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, income: request.income, partnerIncome: request.partnerIncome ?? 0, wealth: request.wealth }),
      })
      const d = await res.json()
      if (d.error) setError(d.error)
      else setEstimate(d.estimate)
    } catch {
      setError(t("err.estv.unreachable"))
    } finally {
      setBusy(false)
    }
  }

  const churchSelect = (value: TaxProfile["church"], onChange: (c: TaxProfile["church"]) => void) => (
    <select value={value} onChange={e => onChange(e.target.value as TaxProfile["church"])} className={selectClass}>
      {CHURCHES.map(c => <option key={c} value={c}>{t(`tax.estimate.church.${c}`)}</option>)}
    </select>
  )

  const r = estimate?.result
  const netIncome = estimate ? estimate.request.income + (estimate.request.partnerIncome ?? 0) : 0
  // Church tax and head tax only where there is one.
  const resultRows = r ? [
    { key: "federalIncome", value: r.income.federal, always: true },
    { key: "cantonIncome",  value: r.income.canton,  always: true },
    { key: "cityIncome",    value: r.income.city,    always: true },
    { key: "churchIncome",  value: r.income.church,  always: false },
    { key: "cantonWealth",  value: r.wealth.canton,  always: true },
    { key: "cityWealth",    value: r.wealth.city,    always: true },
    { key: "churchWealth",  value: r.wealth.church,  always: false },
    { key: "headTax",       value: r.headTax,        always: false },
  ] as const : []

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{t("tax.estimate.title", { year })}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">

        <div>
          {data.wealth.lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("tax.estimate.noData", { year })}</p>
          ) : (
            <>
              {data.wealth.lines.map(l => <Amount key={l.key} label={t(`tax.estimate.line.${l.key}`)} value={l.amount} />)}
              <Amount label={t("tax.estimate.taxable")} value={data.wealth.total} strong />
            </>
          )}
          <p className="text-xs text-muted-foreground mt-2">{t("tax.estimate.linesNote")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <span className="block text-xs uppercase text-muted-foreground mb-1">{t("tax.estimate.place")}</span>
            <PlacePicker value={profile.location} onChange={location => save({ location })} />
          </div>
          <Field label={t("tax.estimate.relationship")}>
            <select
              value={profile.relationship}
              onChange={e => save({ relationship: e.target.value as TaxProfile["relationship"] })}
              className={selectClass}
            >
              {RELATIONSHIPS.map(rel => <option key={rel} value={rel}>{t(`tax.estimate.relationship.${rel}`)}</option>)}
            </select>
          </Field>
          <Field label={t("tax.estimate.children")}>
            <select value={profile.children} onChange={e => save({ children: Number(e.target.value) })} className={selectClass}>
              {Array.from({ length: MAX_CHILDREN + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label={t("tax.estimate.church")}>
            {churchSelect(profile.church, church => save({ church }))}
          </Field>
          {hasPartner(profile) && (
            <Field label={t("tax.estimate.partnerChurch")}>
              {churchSelect(profile.partnerChurch, partnerChurch => save({ partnerChurch }))}
            </Field>
          )}
          <AmountField label={t("tax.estimate.income")} value={income} onChange={setIncome} suggested={data.income} />
          {hasPartner(profile) && (
            <AmountField label={t("tax.estimate.partnerIncome")} value={partnerIncome} onChange={setPartnerIncome} />
          )}
          <AmountField label={t("tax.estimate.amount")} value={wealth} onChange={setWealth} suggested={data.wealth.total} />
          <p className="sm:col-span-2 -mt-2 text-xs text-muted-foreground">
            {t("tax.estimate.incomeNote", { year, booked: f.decimal(data.income) })}
          </p>
        </div>

        <div>
          {!supported ? (
            <p className="text-sm text-muted-foreground">{t("tax.estimate.tooEarly", { first: FIRST_ESTV_YEAR })}</p>
          ) : (
            <>
              <Button onClick={calculate} disabled={busy || !request || upToDate}>
                {busy ? t("tax.estimate.calculating") : t("tax.estimate.calculate")}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                {profile.location ? rich("tax.estimate.sent", { estv: estvLink }) : t("tax.estimate.needPlace")}
              </p>
            </>
          )}
          {error && <p className="text-sm text-negative mt-2">{error}</p>}
        </div>

        {estimate && r && (
          <div className={upToDate ? "" : "opacity-60"}>
            <p className="font-display text-3xl">Fr. {f.decimal(r.total)}</p>
            <p className="text-xs text-muted-foreground mt-1 mb-2">
              {netIncome > 0 && <>{t("tax.estimate.rate", { rate: f.decimal(r.total / netIncome * 100) })} · </>}
              {rich("tax.estimate.resultFor", { estv: estvLink }, {
                place: placeName(estimate.location),
                date: f.date(estimate.at, { day: "2-digit", month: "2-digit", year: "numeric" }),
              })}
            </p>
            {resultRows.filter(row => row.always || row.value !== 0).map(row => (
              <Amount key={row.key} label={t(`tax.estimate.result.${row.key}`)} value={row.value} />
            ))}
            {!upToDate && <p className="text-xs text-highlight mt-2">{t("tax.estimate.outdated")}</p>}
          </div>
        )}

        <p className="text-xs text-muted-foreground">{rich("tax.estimate.note", { estv: estvLink })}</p>
      </CardContent>
    </Card>
  )
}
