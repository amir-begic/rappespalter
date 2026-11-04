"use client"

import { useState, useRef } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useT } from "@/lib/i18n/provider"
import type { MessageKey } from "@/locales"

// One upload card per supported export (bank, broker), used on Data → Import and
// in the first-start setup (/welcome).

type ImportStatus = "idle" | "loading" | "success" | "error"

export interface ImportResult {
  imported: number
  skipped:  number
  total:    number
  notes:    string[] // extra lines shown under the counts
}

export interface Source {
  id:           string
  name:         string // the bank / broker's own name, never translated
  purpose:      MessageKey
  description:  MessageKey
  extensions:   string[] // e.g. [".xlsx"]
  endpoint:     string
  loadingText:  MessageKey
  result:       { href: string; label: MessageKey }
  instructions: { title: MessageKey; steps: MessageKey[] }
  // Optional work after a successful upload; returns extra notes to show.
  afterImport?: (data: Record<string, unknown>, t: Translate) => Promise<string[]>
}

type Translate = ReturnType<typeof useT>["t"]

// What /api/import reports beyond the counts.
function bankNotes(data: Record<string, unknown>, t: Translate): string[] {
  return [
    ...(Number(data.byRule) ? [t("import.byRule", { count: Number(data.byRule) })] : []),
    ...(Number(data.toReview) ? [t("import.toReview", { count: Number(data.toReview) })] : []),
    ...(Number(data.uncategorized) ? [t("import.uncategorized", { count: Number(data.uncategorized) })] : []),
    ...(Number(data.transfers) ? [t("import.transfers", { count: Number(data.transfers) })] : []),
  ]
}

export const IMPORT_SOURCES: Source[] = [
  {
    id:          "raiffeisen",
    name:        "Raiffeisen",
    purpose:     "import.raiffeisen.purpose",
    description: "import.raiffeisen.description",
    extensions:  [".xlsx"],
    endpoint:    "/api/import",
    loadingText: "import.raiffeisen.loading",
    result:      { href: "/dashboard", label: "import.raiffeisen.result" },
    instructions: {
      title: "import.raiffeisen.how",
      steps: ["import.raiffeisen.step1", "import.raiffeisen.step2", "import.raiffeisen.step3", "import.raiffeisen.step4"],
    },
    afterImport: async (data, t) => bankNotes(data, t),
  },
  {
    // Any Swiss bank's ISO 20022 statement (src/lib/camt.ts).
    id:          "camt",
    name:        "camt.053",
    purpose:     "import.camt.purpose",
    description: "import.camt.description",
    extensions:  [".xml", ".zip"],
    endpoint:    "/api/import",
    loadingText: "import.raiffeisen.loading",
    result:      { href: "/dashboard", label: "import.raiffeisen.result" },
    instructions: {
      title: "import.camt.how",
      steps: ["import.camt.step1", "import.camt.step2", "import.camt.step3", "import.camt.step4"],
    },
    afterImport: async (data, t) => bankNotes(data, t),
  },
  {
    id:          "yuh",
    name:        "Yuh",
    purpose:     "import.yuh.purpose",
    description: "import.yuh.description",
    extensions:  [".csv"],
    endpoint:    "/api/portfolio/import",
    loadingText: "import.yuh.loading",
    result:      { href: "/portfolio", label: "import.yuh.result" },
    instructions: {
      title: "import.yuh.how",
      steps: ["import.yuh.step1", "import.yuh.step2", "import.yuh.step3"],
    },
    afterImport: async (data, t) => {
      const notes: string[] = []
      if (Number(data.rejected)) notes.push(t("import.rejected", { count: Number(data.rejected) }))
      if (Array.isArray(data.unknown) && data.unknown.length) notes.push(t("import.unknownTypes", { types: data.unknown.join(", ") }))
      try {
        const res = await fetch("/api/portfolio/refresh", { method: "POST" })
        const r = await res.json()
        if (!res.ok) throw new Error(r.error)
        if (r.matched?.length) notes.push(t("import.matched", { symbols: r.matched.join(", ") }))
        if (r.failed?.length) notes.push(t("import.unpriced", { symbols: r.failed.map((f: { symbol: string }) => f.symbol).join(", ") }))
      } catch {
        notes.push(t("import.priceUnreachable"))
      }
      return notes
    },
  },
]

// `onImported` runs after a successful upload (the setup uses it to move on).
export function ImportCard({ source, onImported }: { source: Source; onImported?: (r: ImportResult) => void }) {
  const { t } = useT()
  const [status, setStatus]         = useState<ImportStatus>("idle")
  const [result, setResult]         = useState<ImportResult | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [fileName, setFileName]     = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const extension = source.extensions.join(" / ")

  async function handleFile(file: File) {
    if (!source.extensions.some(ext => file.name.toLowerCase().endsWith(ext))) {
      setError(t("import.wrongType", { extension, name: source.name }))
      setStatus("error")
      return
    }

    setFileName(file.name)
    setStatus("loading")
    setError(null)
    setResult(null)

    const formData = new FormData()
    formData.append("file", file)

    try {
      const res = await fetch(source.endpoint, {
        method: "POST",
        body:   formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? t("import.failed"))
        setStatus("error")
        return
      }

      const notes = source.afterImport ? await source.afterImport(data, t) : []
      const r = { imported: data.imported, skipped: data.skipped, total: data.total, notes }
      setResult(r)
      setStatus("success")
      onImported?.(r)
    } catch {
      setError(t("import.unreachable"))
      setStatus("error")
    }
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(true)
  }

  function reset() {
    setStatus("idle")
    setResult(null)
    setError(null)
    setFileName(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <section aria-labelledby={`${source.id}-title`} className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle id={`${source.id}-title`} className="text-base">{source.name}</CardTitle>
            <Badge variant="outline">{t(source.purpose)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{t(source.description)}</p>
        </CardHeader>
        <CardContent>
          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            aria-label={t("import.uploadAria", { name: source.name, extension })}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={e => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), fileInputRef.current?.click())}
            className={`
              border-2 border-dashed rounded-lg px-6 py-10 text-center cursor-pointer
              transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring
              ${isDragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted/30"
              }
            `}
          >
            <div className="text-3xl mb-3">📂</div>
            <p className="text-sm break-all">
              {fileName ?? t("import.dropHere", { extension })}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("import.orBrowse")}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept={source.extensions.join(",")}
              className="hidden"
              onChange={onFileInputChange}
            />
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {status === "loading" && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              {t(source.loadingText)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success */}
      {status === "success" && result && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {t("import.complete")}
              <Badge variant="secondary" className="text-positive">
                ✓
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-xs uppercase text-muted-foreground mb-1">
                  {t("import.imported")}
                </p>
                <p className="font-display text-3xl text-positive">
                  {result.imported}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground mb-1">
                  {t("import.skipped")}
                </p>
                <p className="font-display text-3xl text-muted-foreground">
                  {result.skipped}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground mb-1">
                  {t("import.total")}
                </p>
                <p className="font-display text-3xl">
                  {result.total}
                </p>
              </div>
            </div>
            {result.notes.length > 0 && (
              <ul className="text-xs text-muted-foreground space-y-1 mb-4">
                {result.notes.map(n => <li key={n}>{n}</li>)}
              </ul>
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={reset}>
                {t("import.another")}
              </Button>
              <Button size="sm" asChild>
                <Link href={source.result.href}>{t(source.result.label)}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {status === "error" && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive mb-3">
              {error}
            </p>
            <Button variant="outline" size="sm" onClick={reset}>
              {t("import.tryAgain")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      {status === "idle" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              {t(source.instructions.title)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              {source.instructions.steps.map(step => <li key={step}>{t(step)}</li>)}
            </ol>
          </CardContent>
        </Card>
      )}
    </section>
  )
}
