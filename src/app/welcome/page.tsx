"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageLoading } from "@/components/page-loading"
import { BackupCard } from "@/components/backup-card"
import { IMPORT_SOURCES, ImportCard } from "@/components/import-card"
import { SortTopPayees } from "@/components/sort-top-payees"
import { ageOn, type SettingKey, type Settings } from "@/lib/settings"
import { LOCALES, LOCALE_NAMES, isLocale } from "@/lib/i18n/locales"
import { useSetLanguage, useT } from "@/lib/i18n/provider"
import type { MessageKey } from "@/locales"
import { cn } from "@/lib/utils"

// First-start setup: the Settings data points (birth date, monthly saving,
// balances today) and the first bank import, one step at a time. `/` sends a new
// database here (src/lib/onboarding.ts); every step can be skipped, progress is
// saved, and everything can be changed later on Settings and Import. The first
// screen offers the language, so it can be changed before reading anything.

const STEPS: MessageKey[] = [
  "welcome.step.welcome", "welcome.step.you", "welcome.step.saving",
  "welcome.step.balances", "welcome.step.import", "welcome.step.sort", "welcome.step.done",
]
const LAST = STEPS.length - 1

const thisMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

// Throws the server's message, or an empty one when it sent none (callers fall back
// to a translated "Failed to save").
async function send(url: string, body: unknown, method = "PUT") {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? "")
  return data
}

const saveStep = (step: number, state?: "started" | "done" | "skipped") => send("/api/onboarding", { step, ...(state ? { state } : {}) })

type Amounts = Partial<Record<SettingKey | "checking", string>>

export default function WelcomePage() {
  const router = useRouter()
  const { t, rich, f, locale } = useT()
  const setLanguage = useSetLanguage()
  const [step, setStep]         = useState<number | null>(null)
  const [birthDate, setBirthDate] = useState("")
  const [amounts, setAmounts]   = useState<Amounts>({})
  const [snapshot, setSnapshot] = useState(true)
  const [imported, setImported] = useState<string[]>([])
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const failure = (e: unknown) => e instanceof Error && e.message ? e.message : t("common.saveFailed")

  useEffect(() => {
    Promise.all([fetch("/api/onboarding").then(r => r.json()), fetch("/api/settings").then(r => r.json())])
      .then(([o, s]) => {
        if (!o.show) { router.replace("/dashboard"); return }
        if (s.settings) {
          if (!s.birthDateEstimated) setBirthDate(s.settings.birthDate ?? "")
          // Prefill with anything already set (env defaults or an earlier visit); 0 shows as empty.
          setAmounts(Object.fromEntries(
            Object.entries(s.settings as Settings)
              .filter(([k, v]) => k !== "birthDate" && typeof v === "number" && v > 0)
              .map(([k, v]) => [k, String(v)])
          ))
        }
        setStep(Math.min(o.step ?? 0, LAST))
      })
      .catch(() => setError(t("welcome.loadFailed")))
    // Runs once; the message is only read if loading fails.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const set = (key: keyof Amounts, value: string) => setAmounts(a => ({ ...a, [key]: value }))
  const amount = (key: keyof Amounts) => {
    const v = amounts[key]
    return v == null || v.trim() === "" ? 0 : Number(v)
  }

  async function go(to: number, save?: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await save?.()
      await saveStep(to, to === LAST ? "done" : "started")
      setStep(to)
      window.scrollTo({ top: 0 })
    } catch (e) {
      setError(failure(e))
    } finally {
      setBusy(false)
    }
  }

  async function skipAll() {
    setBusy(true)
    await saveStep(0, "skipped").catch(() => {})
    router.push("/dashboard")
  }

  async function finish(href: string) {
    await saveStep(LAST, "done").catch(() => {})
    router.push(href)
  }

  async function changeLanguage(next: string) {
    if (!isLocale(next)) return
    try {
      await setLanguage(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("language.saveFailed"))
    }
  }

  function checkAmounts(keys: (keyof Amounts)[]) {
    const bad = keys.find(k => !Number.isFinite(amount(k)) || amount(k) < 0)
    if (bad) throw new Error(t("welcome.amountsInvalid"))
  }

  const saveYou = async () => {
    if (birthDate) await send("/api/settings", { settings: { birthDate } })
  }
  const saveSaving = async () => {
    const keys = ["monthlyEtf", "monthly3a", "monthlyPillar2"] as const
    checkAmounts([...keys])
    await send("/api/settings", { settings: Object.fromEntries(keys.map(k => [k, amount(k)])) })
  }
  const saveBalances = async () => {
    const keys = ["initEtf", "initSavings", "initPillar3a", "initPillar2"] as const
    checkAmounts([...keys, "checking"])
    await send("/api/settings", { settings: Object.fromEntries(keys.map(k => [k, amount(k)])) })
    if (snapshot) {
      // The note is stored with the snapshot, so it stays as written, whatever the language.
      await send("/api/snapshots", {
        month: thisMonth(), checking: amount("checking"), savings: amount("initSavings"),
        etf: amount("initEtf"), pillar3a: amount("initPillar3a"), pillar2: amount("initPillar2"),
        notes: "From the first-start setup",
      }, "POST")
    }
  }

  const bold = { b: (text: string) => <strong className="font-medium">{text}</strong> }

  return (
    <div className={cn("mx-auto py-10 px-4", step === 4 ? "max-w-5xl" : "max-w-2xl")}>
      {step == null && !error && <PageLoading />}
      {step == null && error && (
        <p className="text-sm text-destructive py-20 text-center">
          {error} <Link href="/dashboard" className="underline">{t("welcome.openDashboard")}</Link>
        </p>
      )}

      {step != null && (
        <div className="space-y-6">
          <Progress step={step} />

          {step === 0 && (
            <>
              <div>
                <p className="text-xs uppercase text-muted-foreground mb-2">{t("welcome.intro.label")}</p>
                <h1>{t("welcome.intro.title")}</h1>
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{t("welcome.intro.text")}</p>
              </div>
              <div role="group" aria-label={t("language.title")} className="flex flex-wrap gap-1.5">
                {LOCALES.map(l => (
                  <Button
                    key={l} size="sm" lang={l} variant={l === locale ? "default" : "outline"}
                    aria-pressed={l === locale} onClick={() => changeLanguage(l)}
                  >
                    {LOCALE_NAMES[l]}
                  </Button>
                ))}
              </div>
              <Card>
                <CardContent className="pt-6 space-y-3 text-sm">
                  {(["you", "saving", "balances", "import"] as const).map((item, i) => (
                    <p key={item} className="flex gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-pop-blue text-xs text-white">{i + 1}</span>
                      <span>{rich(`welcome.intro.${item}`, bold)}</span>
                    </p>
                  ))}
                </CardContent>
              </Card>
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={busy} onClick={() => go(1)}>{t("welcome.start")}</Button>
                <Button variant="ghost" disabled={busy} onClick={skipAll}>{t("welcome.skipAll")}</Button>
              </div>
              <details className="group">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                  {t("welcome.restore")}
                </summary>
                <div className="mt-3"><BackupCard /></div>
              </details>
            </>
          )}

          {step === 1 && (
            <StepShell
              label={t("welcome.you.label")} title={t("welcome.you.title")} text={t("welcome.you.text")}
              busy={busy} error={error}
              onBack={() => go(0)} onSkip={() => go(2)} onNext={() => go(2, saveYou)} nextDisabled={!birthDate}
            >
              <Card>
                <CardContent className="pt-6">
                  <label className="block max-w-xs">
                    <span className="text-xs uppercase text-muted-foreground">{t("welcome.you.birthDate")}</span>
                    <Input
                      type="date" max={new Date().toISOString().slice(0, 10)} value={birthDate}
                      onChange={e => setBirthDate(e.target.value)} className="mt-1 h-9"
                    />
                  </label>
                  {birthDate && <p className="text-xs text-muted-foreground mt-2">{t("welcome.you.age", { age: ageOn(birthDate) })}</p>}
                </CardContent>
              </Card>
            </StepShell>
          )}

          {step === 2 && (
            <StepShell
              label={t("welcome.saving.label")} title={t("welcome.saving.title")} text={t("welcome.saving.text")}
              busy={busy} error={error}
              onBack={() => go(1)} onSkip={() => go(3)} onNext={() => go(3, saveSaving)}
            >
              <Card>
                <CardContent className="pt-6 grid gap-4 sm:grid-cols-3">
                  <AmountField label={t("welcome.saving.etf")} hint={t("welcome.saving.etfHint")} value={amounts.monthlyEtf} onChange={v => set("monthlyEtf", v)} />
                  <AmountField label={t("welcome.saving.pillar3a")} hint={t("welcome.saving.pillar3aHint")} value={amounts.monthly3a} onChange={v => set("monthly3a", v)} />
                  <AmountField label={t("welcome.saving.pillar2")} hint={t("welcome.saving.pillar2Hint")} value={amounts.monthlyPillar2} onChange={v => set("monthlyPillar2", v)} />
                </CardContent>
              </Card>
            </StepShell>
          )}

          {step === 3 && (
            <StepShell
              label={t("welcome.balances.label")} title={t("welcome.balances.title")} text={t("welcome.balances.text")}
              busy={busy} error={error}
              onBack={() => go(2)} onSkip={() => go(4)} onNext={() => go(4, saveBalances)}
            >
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <AmountField label={t("welcome.balances.checking")} value={amounts.checking} onChange={v => set("checking", v)} />
                    <AmountField label={t("welcome.balances.savings")} value={amounts.initSavings} onChange={v => set("initSavings", v)} />
                    <AmountField label={t("welcome.balances.etf")} value={amounts.initEtf} onChange={v => set("initEtf", v)} />
                    <AmountField label={t("welcome.balances.pillar3a")} value={amounts.initPillar3a} onChange={v => set("initPillar3a", v)} />
                    <AmountField label={t("welcome.balances.pillar2")} value={amounts.initPillar2} onChange={v => set("initPillar2", v)} />
                  </div>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={snapshot} onChange={e => setSnapshot(e.target.checked)} className="mt-1 accent-primary" />
                    <span>
                      {t("welcome.balances.snapshot")}
                      <span className="block text-xs text-muted-foreground">{t("welcome.balances.snapshotHint")}</span>
                    </span>
                  </label>
                  <p className="text-xs text-muted-foreground">{t("welcome.balances.assetsHint")}</p>
                </CardContent>
              </Card>
            </StepShell>
          )}

          {step === 4 && (
            <StepShell
              label={t("welcome.import.label")} title={t("welcome.import.title")} text={t("welcome.import.text")}
              busy={busy} error={error}
              onBack={() => go(3)} onNext={() => go(imported.length ? 5 : LAST)}
              nextLabel={imported.length ? t("welcome.import.continue") : t("welcome.import.continueWithout")}
            >
              <div className="grid gap-6 lg:grid-cols-2 items-start">
                {IMPORT_SOURCES.map(source => (
                  <ImportCard
                    key={source.id} source={source}
                    onImported={() => setImported(s => s.includes(source.name) ? s : [...s, source.name])}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("welcome.import.notListed")}</p>
            </StepShell>
          )}

          {step === 5 && (
            <StepShell
              label={t("welcome.sort.label")} title={t("welcome.sort.title")} text={t("welcome.sort.text")}
              busy={busy} error={error}
              onBack={() => go(4)} onNext={() => go(LAST)}
              nextLabel={t("welcome.sort.continue")}
            >
              <SortTopPayees />
            </StepShell>
          )}

          {step === LAST && (
            <>
              <div>
                <p className="text-xs uppercase text-muted-foreground mb-2">{t("welcome.done.label")}</p>
                <h1>{t("welcome.done.title")}</h1>
                <p className="text-sm text-muted-foreground mt-3">
                  {imported.length
                    ? t("welcome.done.imported", { sources: f.list(imported) })
                    : t("welcome.done.noImport")}{" "}
                  {t("welcome.done.changeLater")}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {([
                  { href: "/dashboard", title: "welcome.done.dashboard", text: "welcome.done.dashboardText" },
                  { href: "/budgets",   title: "welcome.done.budgets",   text: "welcome.done.budgetsText" },
                  { href: "/goal",      title: "welcome.done.goals",     text: "welcome.done.goalsText" },
                ] as const).map(l => (
                  <button
                    key={l.href} type="button" onClick={() => finish(l.href)}
                    className="rounded-3xl bg-card p-5 text-left transition-colors hover:bg-accent"
                  >
                    <span className="block text-xs uppercase text-muted-foreground">{t(l.title)}</span>
                    <span className="mt-1 block text-sm">{t(l.text)} →</span>
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => go(4)}><ArrowLeft className="size-3" /> {t("welcome.done.backToImport")}</Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Progress({ step }: { step: number }) {
  const { t } = useT()
  return (
    <ol className="flex flex-wrap items-center gap-1" aria-label={t("welcome.progress")}>
      {STEPS.map((name, i) => (
        <li
          key={name}
          aria-current={i === step ? "step" : undefined}
          className={cn(
            "flex items-center gap-1 rounded-full px-3 pt-1.5 pb-[0.3rem] text-[0.6875rem] uppercase",
            i === step ? "bg-pop-blue text-white" : i < step ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {i < step && <Check className="size-3" />}
          {t(name)}
        </li>
      ))}
    </ol>
  )
}

function StepShell({ label, title, text, busy, error, nextDisabled, nextLabel, onBack, onSkip, onNext, children }: {
  label: string; title: string; text: string; busy: boolean; error: string | null
  nextDisabled?: boolean; nextLabel?: string
  onBack: () => void; onSkip?: () => void; onNext: () => void; children: React.ReactNode
}) {
  const { t } = useT()
  return (
    <>
      <div>
        <p className="text-xs uppercase text-muted-foreground mb-2">{label}</p>
        <h1>{title}</h1>
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{text}</p>
      </div>
      <div className="space-y-4">{children}</div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" disabled={busy} onClick={onBack}><ArrowLeft className="size-3" /> {t("common.back")}</Button>
        <span className="ml-auto" />
        {onSkip && <Button variant="outline" disabled={busy} onClick={onSkip}>{t("common.skip")}</Button>}
        <Button disabled={busy || nextDisabled} onClick={onNext}>{busy ? t("welcome.saving") : nextLabel ?? t("common.continue")}</Button>
      </div>
    </>
  )
}

function AmountField({ label, hint, value, onChange }: {
  label: string; hint?: string; value: string | undefined; onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="text-sm text-muted-foreground">Fr.</span>
        <Input type="number" min={0} step={50} value={value ?? ""} placeholder="0" onChange={e => onChange(e.target.value)} className="h-9" />
      </div>
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  )
}
