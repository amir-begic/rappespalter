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
import { ageOn, type SettingKey, type Settings } from "@/lib/settings"
import { cn } from "@/lib/utils"

// First-start setup: the Settings data points (birth date, monthly saving,
// balances today) and the first bank import, one step at a time. `/` sends a new
// database here (src/lib/onboarding.ts); every step can be skipped, progress is
// saved, and everything can be changed later on Settings and Import.

const STEPS = ["Welcome", "You", "Saving", "Balances", "Import", "Done"] as const
const LAST = STEPS.length - 1

const thisMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

async function send(url: string, body: unknown, method = "PUT") {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? "Failed to save")
  return data
}

const saveStep = (step: number, state?: "started" | "done" | "skipped") => send("/api/onboarding", { step, ...(state ? { state } : {}) })

type Amounts = Partial<Record<SettingKey | "checking", string>>

export default function WelcomePage() {
  const router = useRouter()
  const [step, setStep]         = useState<number | null>(null)
  const [birthDate, setBirthDate] = useState("")
  const [amounts, setAmounts]   = useState<Amounts>({})
  const [snapshot, setSnapshot] = useState(true)
  const [imported, setImported] = useState<string[]>([])
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState<string | null>(null)

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
      .catch(() => setError("Couldn't load the setup — you can still use the app."))
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
      setError(e instanceof Error ? e.message : "Failed to save")
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

  function checkAmounts(keys: (keyof Amounts)[]) {
    const bad = keys.find(k => !Number.isFinite(amount(k)) || amount(k) < 0)
    if (bad) throw new Error("Amounts must be numbers ≥ 0")
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
      await send("/api/snapshots", {
        month: thisMonth(), checking: amount("checking"), savings: amount("initSavings"),
        etf: amount("initEtf"), pillar3a: amount("initPillar3a"), pillar2: amount("initPillar2"),
        notes: "From the first-start setup",
      }, "POST")
    }
  }

  return (
    <div className={cn("mx-auto py-10 px-4", step === 4 ? "max-w-5xl" : "max-w-2xl")}>
      {step == null && !error && <PageLoading />}
      {step == null && error && (
        <p className="text-sm text-destructive py-20 text-center">
          {error} <Link href="/dashboard" className="underline">Open the dashboard</Link>
        </p>
      )}

      {step != null && (
        <div className="space-y-6">
          <Progress step={step} />

          {step === 0 && (
            <>
              <div>
                <p className="text-xs uppercase text-muted-foreground mb-2">Welcome</p>
                <h1>Hoi! Let&apos;s set up Rappespalter</h1>
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                  A few questions about you and your money, then your first bank export — about five minutes.
                  Everything stays on this computer; nothing is sent anywhere. Every step can be skipped and
                  changed later on Settings.
                </p>
              </div>
              <Card>
                <CardContent className="pt-6 space-y-3 text-sm">
                  {[
                    ["You", "your birth date, so forecasts run until retirement"],
                    ["Saving", "what goes into ETFs, Säule 3a and your pension fund each month"],
                    ["Balances", "what your accounts hold today — the starting point for Net Worth and Goals"],
                    ["Import", "an export from your bank, for spending, budgets and trends"],
                  ].map(([title, text], i) => (
                    <p key={title} className="flex gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-pop-blue text-xs text-white">{i + 1}</span>
                      <span><strong className="font-medium">{title}</strong> — {text}</span>
                    </p>
                  ))}
                </CardContent>
              </Card>
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={busy} onClick={() => go(1)}>Let&apos;s go</Button>
                <Button variant="ghost" disabled={busy} onClick={skipAll}>Skip — I&apos;ll look around first</Button>
              </div>
              <details className="group">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                  Moving from another computer? Restore a backup instead
                </summary>
                <div className="mt-3"><BackupCard /></div>
              </details>
            </>
          )}

          {step === 1 && (
            <StepShell
              label="About you" title="When were you born?"
              text="Forecasts are drawn on your age and run until you retire at 65 (you can try other ages on Projections)."
              busy={busy} error={error}
              onBack={() => go(0)} onSkip={() => go(2)} onNext={() => go(2, saveYou)} nextDisabled={!birthDate}
            >
              <Card>
                <CardContent className="pt-6">
                  <label className="block max-w-xs">
                    <span className="text-xs uppercase text-muted-foreground">Birth date</span>
                    <Input
                      type="date" max={new Date().toISOString().slice(0, 10)} value={birthDate}
                      onChange={e => setBirthDate(e.target.value)} className="mt-1 h-9"
                    />
                  </label>
                  {birthDate && <p className="text-xs text-muted-foreground mt-2">That makes you {ageOn(birthDate)}.</p>}
                </CardContent>
              </Card>
            </StepShell>
          )}

          {step === 2 && (
            <StepShell
              label="Saving" title="What do you put away each month?"
              text="Used by the forecast on Projections. Roughly is fine — your actual savings show up once your bank export is in."
              busy={busy} error={error}
              onBack={() => go(1)} onSkip={() => go(3)} onNext={() => go(3, saveSaving)}
            >
              <Card>
                <CardContent className="pt-6 grid gap-4 sm:grid-cols-3">
                  <AmountField label="ETFs / investing" hint="Standing order to your broker" value={amounts.monthlyEtf} onChange={v => set("monthlyEtf", v)} />
                  <AmountField label="Säule 3a" hint="There's a yearly maximum" value={amounts.monthly3a} onChange={v => set("monthly3a", v)} />
                  <AmountField label="2. Säule" hint="Your + employer's part, from the payslip" value={amounts.monthlyPillar2} onChange={v => set("monthlyPillar2", v)} />
                </CardContent>
              </Card>
            </StepShell>
          )}

          {step === 3 && (
            <StepShell
              label="Balances" title="What do your accounts hold today?"
              text="The starting point for Net Worth, Goals and the forecast. Your pension fund statement shows the 2. Säule balance."
              busy={busy} error={error}
              onBack={() => go(2)} onSkip={() => go(4)} onNext={() => go(4, saveBalances)}
            >
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <AmountField label="Checking account" value={amounts.checking} onChange={v => set("checking", v)} />
                    <AmountField label="Savings account" value={amounts.initSavings} onChange={v => set("initSavings", v)} />
                    <AmountField label="ETF portfolio" value={amounts.initEtf} onChange={v => set("initEtf", v)} />
                    <AmountField label="Säule 3a" value={amounts.initPillar3a} onChange={v => set("initPillar3a", v)} />
                    <AmountField label="2. Säule" value={amounts.initPillar2} onChange={v => set("initPillar2", v)} />
                  </div>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={snapshot} onChange={e => setSnapshot(e.target.checked)} className="mt-1 accent-primary" />
                    <span>
                      Record these as this month&apos;s snapshot
                      <span className="block text-xs text-muted-foreground">
                        Net Worth and Goals start from it. Add a new one each month on Projections.
                      </span>
                    </span>
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Gold, crypto, collections or a car? Add them under Wealth → Assets once you&apos;re set up.
                  </p>
                </CardContent>
              </Card>
            </StepShell>
          )}

          {step === 4 && (
            <StepShell
              label="Import" title="Bring in your bank transactions"
              text="Spending, income, budgets and trends all come from your bank's export. Start with the last 12 months if you can — re-importing later is safe, duplicates are skipped."
              busy={busy} error={error}
              onBack={() => go(3)} onNext={() => go(5)}
              nextLabel={imported.length ? "Continue" : "Continue without importing"}
            >
              <div className="grid gap-6 lg:grid-cols-2 items-start">
                {IMPORT_SOURCES.map(source => (
                  <ImportCard
                    key={source.id} source={source}
                    onImported={() => setImported(s => s.includes(source.name) ? s : [...s, source.name])}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Your bank isn&apos;t listed? Only Raiffeisen (Finanzassistent) exports can be read for now; Yuh covers
                investments. You can still use Projections, Goals and Assets with the balances you entered.
              </p>
            </StepShell>
          )}

          {step === 5 && (
            <>
              <div>
                <p className="text-xs uppercase text-muted-foreground mb-2">All set</p>
                <h1>You&apos;re ready 🎉</h1>
                <p className="text-sm text-muted-foreground mt-3">
                  {imported.length
                    ? `Imported from ${imported.join(" and ")}. `
                    : "No export yet — add one any time on Data → Import. "}
                  Everything you entered can be changed on Settings (the gear, top right).
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { href: "/dashboard", title: "Dashboard", text: "This month's spending and saving" },
                  { href: "/budgets",   title: "Budgets",   text: "Set monthly limits per category" },
                  { href: "/goal",      title: "Goals",     text: "A home, a trip, a safety net" },
                ].map(l => (
                  <button
                    key={l.href} type="button" onClick={() => finish(l.href)}
                    className="rounded-3xl bg-card p-5 text-left transition-colors hover:bg-accent"
                  >
                    <span className="block text-xs uppercase text-muted-foreground">{l.title}</span>
                    <span className="mt-1 block text-sm">{l.text} →</span>
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => go(4)}><ArrowLeft className="size-3" /> Back to import</Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Progress({ step }: { step: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-1" aria-label="Setup steps">
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
          {name}
        </li>
      ))}
    </ol>
  )
}

function StepShell({ label, title, text, busy, error, nextDisabled, nextLabel = "Continue", onBack, onSkip, onNext, children }: {
  label: string; title: string; text: string; busy: boolean; error: string | null
  nextDisabled?: boolean; nextLabel?: string
  onBack: () => void; onSkip?: () => void; onNext: () => void; children: React.ReactNode
}) {
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
        <Button variant="ghost" disabled={busy} onClick={onBack}><ArrowLeft className="size-3" /> Back</Button>
        <span className="ml-auto" />
        {onSkip && <Button variant="outline" disabled={busy} onClick={onSkip}>Skip</Button>}
        <Button disabled={busy || nextDisabled} onClick={onNext}>{busy ? "Saving…" : nextLabel}</Button>
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
