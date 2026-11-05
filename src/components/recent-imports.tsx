"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { useT } from "@/lib/i18n/provider"

interface ImportBatch {
  id:         number
  fileName:   string
  importedAt: string
  remaining:  number // its transactions still there
  refiled:    number // earlier rows it re-filed as transfers
}

// Data → Import: the recent bank imports, each with Undo (lib/imports.ts).
// `refreshKey` reloads the list after a new import.
export function RecentImports({ refreshKey }: { refreshKey: number }) {
  const { t, f } = useT()
  const [imports, setImports] = useState<ImportBatch[] | null>(null)
  const [pending, setPending] = useState<ImportBatch | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch("/api/imports")
      .then(res => (res.ok ? res.json() : null))
      .then(data => data && setImports(data.imports))
      .catch(() => {})
  }, [refreshKey])

  if (!imports?.length) return null

  async function undo(batch: ImportBatch) {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/imports?id=${batch.id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t("imports.undoFailed"))
      setImports(list => list?.filter(b => b.id !== batch.id) ?? null)
      setMessage({ ok: true, text: t("imports.undone", { count: data.removed }) })
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : t("imports.undoFailed") })
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader className="pb-2">
        <CardTitle>{t("imports.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">{t("imports.text")}</p>
        <div className="space-y-1">
          {imports.map(batch => (
            <div key={batch.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate">{batch.fileName}</span>
                <span className="text-xs text-muted-foreground">
                  {f.date(batch.importedAt, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {" · "}
                  {t("imports.count", { count: batch.remaining })}
                </span>
              </span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPending(batch)}>
                {t("imports.undo")}
              </Button>
            </div>
          ))}
        </div>
        {message && (
          <p className={`text-xs mt-3 ${message.ok ? "text-positive" : "text-destructive"}`}>{message.text}</p>
        )}
      </CardContent>

      <Dialog open={pending !== null} onOpenChange={open => { if (!open && !busy) setPending(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("imports.confirmTitle")}</DialogTitle>
            <DialogDescription>
              {pending && t("imports.confirmText", { count: pending.remaining, name: pending.fileName })}
              {pending && pending.refiled > 0 && <> {t("imports.confirmRefiled", { count: pending.refiled })}</>}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>{t("common.cancel")}</Button>
            <Button onClick={() => pending && undo(pending)} disabled={busy}>{t("imports.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
