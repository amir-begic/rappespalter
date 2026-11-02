"use client"

import { useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

// The browser's "Save as" picker (Chromium). Not in TypeScript's DOM types yet.
type SavePicker = (options: {
  suggestedName: string
  types: { description: string; accept: Record<string, string[]> }[]
}) => Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }>

const fileName = () => `rappespalter-backup-${new Date().toISOString().slice(0, 10)}.db`

// Settings → Backup & restore. Backups are made only when asked, and always ask
// where to go: the desktop app shows its native Save dialog for any download (no
// save path is set in electron/main.js); in a browser we use the "Save as" picker
// where there is one.
export function BackupCard() {
  const [busy, setBusy] = useState<"backup" | "restore" | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, setPending] = useState<File | null>(null)
  const input = useRef<HTMLInputElement>(null)

  async function backup() {
    setMessage(null)
    const isDesktop = "rappespalter" in window
    const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker
    // Ask for the place first, while the click still counts as the user's gesture.
    let handle: Awaited<ReturnType<SavePicker>> | null = null
    if (!isDesktop && picker) {
      try {
        handle = await picker({
          suggestedName: fileName(),
          types: [{ description: "Rappespalter backup", accept: { "application/vnd.sqlite3": [".db"] } }],
        })
      } catch {
        return // cancelled
      }
    }

    setBusy("backup")
    try {
      const res = await fetch("/api/backup")
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create the backup")
      const blob = await res.blob()
      if (handle) {
        const out = await handle.createWritable()
        await out.write(blob)
        await out.close()
        setMessage({ ok: true, text: "Backup saved." })
      } else {
        const url = URL.createObjectURL(blob)
        const a = Object.assign(document.createElement("a"), { href: url, download: fileName() })
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      }
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Failed to create the backup" })
    } finally {
      setBusy(null)
    }
  }

  async function restore(file: File) {
    setPending(null)
    setBusy("restore")
    setMessage(null)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/backup/restore", { method: "POST", body })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to restore the backup")
      // Every page, the theme and the nav read the database: start over with the restored one.
      window.location.reload()
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Failed to restore the backup" })
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Backup &amp; restore</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">
          A backup is one file with all your data: transactions, categories, budgets,
          rules, snapshots, portfolio and settings. You choose where to save it.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={backup} disabled={busy !== null}>
            {busy === "backup" ? "Backing up…" : "Back up…"}
          </Button>
          <Button variant="outline" onClick={() => input.current?.click()} disabled={busy !== null}>
            {busy === "restore" ? "Restoring…" : "Restore…"}
          </Button>
          <input
            ref={input}
            type="file"
            accept=".db,.sqlite,.sqlite3"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (file) setPending(file)
            }}
          />
          {message && (
            <span className={`text-xs ${message.ok ? "text-positive" : "text-destructive"}`}>
              {message.text}
            </span>
          )}
        </div>
      </CardContent>

      <Dialog open={pending !== null} onOpenChange={open => { if (!open) setPending(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore this backup?</DialogTitle>
            <DialogDescription>
              All current data is replaced with <span className="text-foreground">{pending?.name}</span>.
              A copy of what you have now is saved first, in “backups/before-restore”
              next to the database (File → Open Data Folder in the desktop app).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>Cancel</Button>
            <Button onClick={() => pending && restore(pending)}>Replace my data</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
