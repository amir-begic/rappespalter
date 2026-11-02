"use client"

import { useState, useRef } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

type ImportStatus = "idle" | "loading" | "success" | "error"

interface ImportResult {
  imported: number
  skipped:  number
  total:    number
  notes:    string[] // extra lines shown under the counts
}

interface Source {
  id:           string
  name:         string
  purpose:      string
  description:  string
  extension:    string // e.g. ".xlsx"
  endpoint:     string
  loadingText:  string
  result:       { href: string; label: string }
  instructions: { title: string; steps: string[] }
  // Optional work after a successful upload; returns extra notes to show.
  afterImport?: (data: Record<string, unknown>) => Promise<string[]>
}

const SOURCES: Source[] = [
  {
    id:          "raiffeisen",
    name:        "Raiffeisen",
    purpose:     "Bank transactions",
    description: "Spending, income and savings from Raiffeisen Finanzassistent. Feeds the dashboard, budgets, trends and income pages.",
    extension:   ".xlsx",
    endpoint:    "/api/import",
    loadingText: "Parsing and importing transactions…",
    result:      { href: "/dashboard", label: "View dashboard" },
    instructions: {
      title: "How to export from Raiffeisen",
      steps: [
        "Open Raiffeisen e-banking or the Finanzassistent app",
        "Go to Transactions and set your date range",
        "Click Export → Excel (.xlsx)",
        "Upload the downloaded file here",
      ],
    },
    afterImport: async data => Number(data.byRule)
      ? [`${data.byRule} categorized by your rules (Data → Rules)`]
      : [],
  },
  {
    id:          "yuh",
    name:        "Yuh",
    purpose:     "Investments",
    description: "Trades, dividends and fees from your Yuh account. Feeds the Portfolio page only — deposits are already counted on the bank side.",
    extension:   ".csv",
    endpoint:    "/api/portfolio/import",
    loadingText: "Importing activities and fetching market prices…",
    result:      { href: "/portfolio", label: "View portfolio" },
    instructions: {
      title: "How to export from Yuh",
      steps: [
        "In the Yuh app, export your account activities as a CSV file",
        "The file is named like Activities_2026_09_24…CSV",
        "Upload it here — newer exports can be added any time",
      ],
    },
    afterImport: async data => {
      const notes: string[] = []
      if (Number(data.rejected)) notes.push(`${data.rejected} rejected orders ignored`)
      if (Array.isArray(data.unknown) && data.unknown.length) notes.push(`Unrecognised activity types: ${data.unknown.join(", ")}`)
      try {
        const res = await fetch("/api/portfolio/refresh", { method: "POST" })
        const r = await res.json()
        if (!res.ok) throw new Error(r.error)
        if (r.matched?.length) notes.push(`Matched ${r.matched.join(", ")}`)
        if (r.failed?.length) notes.push(`Couldn't price ${r.failed.map((f: { symbol: string }) => f.symbol).join(", ")} — fix on the Portfolio page`)
      } catch {
        notes.push("Couldn't reach the price service — prices will update when you open the Portfolio page")
      }
      return notes
    },
  },
]

export default function ImportPage() {
  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="mb-8">
        <p className="text-xs uppercase text-muted-foreground mb-2">
          Import
        </p>
        <h1>
          Upload your data
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Pick the export that matches your account. Re-uploading the same file is
          safe — anything already imported is skipped automatically.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        {SOURCES.map(source => <ImportCard key={source.id} source={source} />)}
      </div>
    </div>
  )
}

function ImportCard({ source }: { source: Source }) {
  const [status, setStatus]         = useState<ImportStatus>("idle")
  const [result, setResult]         = useState<ImportResult | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [fileName, setFileName]     = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(source.extension)) {
      setError(`Please upload a ${source.extension} file exported from ${source.name}.`)
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
        setError(data.error ?? "Import failed.")
        setStatus("error")
        return
      }

      const notes = source.afterImport ? await source.afterImport(data) : []
      setResult({ imported: data.imported, skipped: data.skipped, total: data.total, notes })
      setStatus("success")
    } catch {
      setError("Could not reach the server.")
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
            <Badge variant="outline">{source.purpose}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{source.description}</p>
        </CardHeader>
        <CardContent>
          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            aria-label={`Upload ${source.name} ${source.extension} file`}
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
              {fileName ?? `Drop your ${source.extension} file here`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              or click to browse
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept={source.extension}
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
              {source.loadingText}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success */}
      {status === "success" && result && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              Import complete
              <Badge variant="secondary" className="text-positive">
                ✓
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-xs uppercase text-muted-foreground mb-1">
                  Imported
                </p>
                <p className="font-display text-3xl text-positive">
                  {result.imported}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground mb-1">
                  Skipped
                </p>
                <p className="font-display text-3xl text-muted-foreground">
                  {result.skipped}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground mb-1">
                  Total
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
                Import another
              </Button>
              <Button size="sm" asChild>
                <Link href={source.result.href}>{source.result.label}</Link>
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
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      {status === "idle" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              {source.instructions.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              {source.instructions.steps.map(step => <li key={step}>{step}</li>)}
            </ol>
          </CardContent>
        </Card>
      )}
    </section>
  )
}
