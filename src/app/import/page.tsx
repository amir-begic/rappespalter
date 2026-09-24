"use client"

import { useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

type ImportStatus = "idle" | "loading" | "success" | "error"

interface ImportResult {
  imported: number
  skipped:  number
  total:    number
}

export default function ImportPage() {
  const [status, setStatus]   = useState<ImportStatus>("idle")
  const [result, setResult]   = useState<ImportResult | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file.name.endsWith(".xlsx")) {
      setError("Please upload a .xlsx file exported from Raiffeisen.")
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
      const res = await fetch("/api/import", {
        method: "POST",
        body:   formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Import failed.")
        setStatus("error")
        return
      }

      setResult(data)
      setStatus("success")
    } catch (e) {
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

  function onDragLeave() {
    setIsDragging(false)
  }

  function reset() {
    setStatus("idle")
    setResult(null)
    setError(null)
    setFileName(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div className="max-w-xl mx-auto py-12 px-4">
      <div className="mb-8">
        <p className="text-xs tracking-widest uppercase text-muted-foreground mb-2">
          Import
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Upload Transactions
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Export your transactions from Raiffeisen Finanzassistent as .xlsx
          and upload them here. Re-uploading the same file is safe — duplicates
          are skipped automatically.
        </p>
      </div>

      {/* Drop zone */}
      <Card className="mb-4">
        <CardContent className="pt-6">
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
              transition-colors duration-150
              ${isDragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted/30"
              }
            `}
          >
            <div className="text-4xl mb-4">📂</div>
            <p className="text-sm font-medium">
              {fileName ?? "Drop your .xlsx file here"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              or click to browse
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
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
              Parsing and importing transactions...
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
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
                  Imported
                </p>
                <p className="text-2xl font-semibold text-positive">
                  {result.imported}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
                  Skipped
                </p>
                <p className="text-2xl font-semibold text-muted-foreground">
                  {result.skipped}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
                  Total
                </p>
                <p className="text-2xl font-semibold">
                  {result.total}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={reset}>
                Import another
              </Button>
              <Button size="sm" asChild>
                <a href="/dashboard">View dashboard</a>
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
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              How to export from Raiffeisen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Open Raiffeisen e-banking or the Finanzassistent app</li>
              <li>Go to Transactions and set your date range</li>
              <li>Click Export → Excel (.xlsx)</li>
              <li>Upload the downloaded file here</li>
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  )
}