"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { useT } from "@/lib/i18n/provider"
import type { MessageKey } from "@/locales"

// The browser's "Save as" picker (Chromium). Not in TypeScript's DOM types yet.
type SavePicker = (options: {
  suggestedName: string
  types: { description: string; accept: Record<string, string[]> }[]
}) => Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }>

// Mirrors lib/backup-crypto.ts (a client component can't import node:crypto code).
const ENCRYPTED_EXTENSION = ".rpbackup"
const MIN_PASSWORD_LENGTH = 8
const MAGIC = "RPBACKUP"

type CopyKind = "daily" | "before-update" | "before-restore"
interface LocalCopy { kind: CopyKind; name: string; date: string; size: number }
interface Info { lastBackupAt: string | null; copies: LocalCopy[] }

type Pending =
  | { from: "file"; file: File; encrypted: boolean }
  | { from: "copy"; copy: LocalCopy }

const KIND_LABEL: Record<CopyKind, MessageKey> = {
  "daily":          "backup.copy.daily",
  "before-update":  "backup.copy.beforeUpdate",
  "before-restore": "backup.copy.beforeRestore",
}

const fileName = (encrypted: boolean) =>
  `rappespalter-backup-${new Date().toISOString().slice(0, 10)}${encrypted ? ENCRYPTED_EXTENSION : ".db"}`

async function isEncryptedFile(file: File) {
  const head = new Uint8Array(await file.slice(0, MAGIC.length).arrayBuffer())
  return String.fromCharCode(...head) === MAGIC
}

// Settings → Backup & restore. Backups are made only when asked, and always ask
// where to go: the desktop app shows its native Save dialog for any download (no
// save path is set in electron/main.js); in a browser we use the "Save as" picker
// where there is one. A backup can have a password (lib/backup-crypto.ts). Below,
// the copies the app keeps on this computer (lib/backup-copies.ts), each restorable.
export function BackupCard() {
  const { t, rich, f } = useT()
  const [busy, setBusy] = useState<"backup" | "restore" | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [info, setInfo] = useState<Info | null>(null)
  const [showCopies, setShowCopies] = useState(false)

  const [asking, setAsking] = useState(false) // the backup dialog
  const [password, setPassword] = useState("")
  const [repeat, setRepeat] = useState("")

  const [pending, setPending] = useState<Pending | null>(null)
  const [restorePassword, setRestorePassword] = useState("")
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    fetch("/api/backup/status")
      .then(res => (res.ok ? res.json() : null))
      .then(data => data && setInfo({ lastBackupAt: data.lastBackupAt, copies: data.copies ?? [] }))
      .catch(() => {})
  }, [])
  useEffect(load, [load])

  const passwordProblem =
    password === "" ? null
    : password.length < MIN_PASSWORD_LENGTH ? t("backup.password.tooShort", { count: MIN_PASSWORD_LENGTH })
    : password !== repeat ? t("backup.password.mismatch")
    : null

  async function backup() {
    const encrypted = password !== ""
    setAsking(false)
    setMessage(null)
    const isDesktop = "rappespalter" in window
    const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker
    // Ask for the place first, while the click still counts as the user's gesture.
    let handle: Awaited<ReturnType<SavePicker>> | null = null
    if (!isDesktop && picker) {
      try {
        handle = await picker({
          suggestedName: fileName(encrypted),
          types: [{
            description: t("backup.fileType"),
            accept: encrypted
              ? { "application/octet-stream": [ENCRYPTED_EXTENSION] }
              : { "application/vnd.sqlite3": [".db"] },
          }],
        })
      } catch {
        return // cancelled
      }
    }

    setBusy("backup")
    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(encrypted ? { password } : {}),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? t("backup.createFailed"))
      const blob = await res.blob()
      if (handle) {
        const out = await handle.createWritable()
        await out.write(blob)
        await out.close()
        setMessage({ ok: true, text: t("backup.saved") })
      } else {
        const url = URL.createObjectURL(blob)
        const a = Object.assign(document.createElement("a"), { href: url, download: fileName(encrypted) })
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      }
      setPassword("")
      setRepeat("")
      load()
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : t("backup.createFailed") })
    } finally {
      setBusy(null)
    }
  }

  async function restore(target: Pending) {
    setBusy("restore")
    setMessage(null)
    setRestoreError(null)
    try {
      let res: Response
      if (target.from === "file") {
        const body = new FormData()
        body.append("file", target.file)
        if (target.encrypted) body.append("password", restorePassword)
        res = await fetch("/api/backup/restore", { method: "POST", body })
      } else {
        res = await fetch("/api/backup/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: target.copy.kind, name: target.copy.name }),
        })
      }
      const data = await res.json()
      if (!res.ok) {
        // A wrong password keeps the dialog open to try again.
        if (data.code === "wrongPassword" || data.code === "needsPassword") {
          setRestoreError(data.error)
          setBusy(null)
          return
        }
        throw new Error(data.error ?? t("backup.restoreFailed"))
      }
      // Every page, the theme and the nav read the database: start over with the restored one.
      window.location.reload()
    } catch (e) {
      setPending(null)
      setMessage({ ok: false, text: e instanceof Error ? e.message : t("backup.restoreFailed") })
      setBusy(null)
    }
  }

  function closeRestore() {
    setPending(null)
    setRestorePassword("")
    setRestoreError(null)
  }

  const describe = (copy: LocalCopy) =>
    `${t(KIND_LABEL[copy.kind])} · ${f.date(copy.date, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`

  return (
    <Card id="backup">
      <CardHeader className="pb-2">
        <CardTitle>{t("backup.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-2">{t("backup.text")}</p>
        {info && (
          <p className="text-xs mb-4">
            {info.lastBackupAt
              ? t("backup.last", { date: f.date(info.lastBackupAt, { day: "numeric", month: "long", year: "numeric" }) })
              : t("backup.lastNever")}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setAsking(true)} disabled={busy !== null}>
            {busy === "backup" ? t("backup.backingUp") : t("backup.backUp")}
          </Button>
          <Button variant="outline" onClick={() => input.current?.click()} disabled={busy !== null}>
            {busy === "restore" ? t("backup.restoring") : t("backup.restore")}
          </Button>
          <input
            ref={input}
            type="file"
            accept={`.db,.sqlite,.sqlite3,${ENCRYPTED_EXTENSION}`}
            className="hidden"
            onChange={async e => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (file) setPending({ from: "file", file, encrypted: await isEncryptedFile(file) })
            }}
          />
          {message && (
            <span className={`text-xs ${message.ok ? "text-positive" : "text-destructive"}`}>
              {message.text}
            </span>
          )}
        </div>

        {info && info.copies.length > 0 && (
          <div className="mt-6">
            <button
              type="button"
              className="text-xs uppercase text-muted-foreground hover:text-foreground"
              aria-expanded={showCopies}
              onClick={() => setShowCopies(s => !s)}
            >
              {t("backup.copies.title", { count: info.copies.length })} {showCopies ? "▴" : "▾"}
            </button>
            {showCopies && (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-muted-foreground mb-2">{t("backup.copies.text")}</p>
                {info.copies.map(copy => (
                  <div key={`${copy.kind}/${copy.name}`} className="flex items-center justify-between gap-3 text-sm">
                    <span>{describe(copy)}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() => setPending({ from: "copy", copy })}
                    >
                      {t("backup.copies.restore")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Making a backup: an optional password. */}
      <Dialog open={asking} onOpenChange={open => { if (!open) setAsking(false) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("backup.dialog.title")}</DialogTitle>
            <DialogDescription>{t("backup.dialog.text")}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={e => { e.preventDefault(); if (!passwordProblem) backup() }}
          >
            <Input
              type="password"
              autoComplete="new-password"
              placeholder={t("backup.password.placeholder")}
              aria-label={t("backup.password.label")}
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            {password !== "" && (
              <Input
                type="password"
                autoComplete="new-password"
                placeholder={t("backup.password.repeat")}
                aria-label={t("backup.password.repeat")}
                value={repeat}
                onChange={e => setRepeat(e.target.value)}
              />
            )}
            <p className={`text-xs ${passwordProblem ? "text-destructive" : "text-muted-foreground"}`}>
              {passwordProblem ?? (password === "" ? t("backup.password.none") : t("backup.password.warning"))}
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAsking(false)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={passwordProblem !== null}>
                {password === "" ? t("backup.dialog.plain") : t("backup.dialog.protected")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Restoring a file or a copy: confirm, and the password if it has one. */}
      <Dialog open={pending !== null} onOpenChange={open => { if (!open && busy === null) closeRestore() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("backup.confirmTitle")}</DialogTitle>
            <DialogDescription>
              {rich("backup.confirmText", {
                name: text => <span className="text-foreground">{text}</span>,
              }, { name: pending ? (pending.from === "file" ? pending.file.name : describe(pending.copy)) : "" })}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={e => { e.preventDefault(); if (pending) restore(pending) }}
          >
            {pending?.from === "file" && pending.encrypted && (
              <>
                <p className="text-xs text-muted-foreground">{t("backup.restorePassword.text")}</p>
                <Input
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  aria-label={t("backup.password.label")}
                  placeholder={t("backup.password.label")}
                  value={restorePassword}
                  onChange={e => setRestorePassword(e.target.value)}
                />
              </>
            )}
            {restoreError && <p className="text-xs text-destructive">{restoreError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeRestore} disabled={busy !== null}>
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={busy !== null || (pending?.from === "file" && pending.encrypted && restorePassword === "")}
              >
                {busy === "restore" ? t("backup.restoring") : t("backup.replace")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
