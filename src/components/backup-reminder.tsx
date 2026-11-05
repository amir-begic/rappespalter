"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n/provider"

// Dashboard nudge when a backup is due (rules in lib/backup-status.ts). Renders
// nothing otherwise; "Later" hides it for two weeks.
export function BackupReminder() {
  const { t } = useT()
  const [due, setDue] = useState<{ days: number; never: boolean } | null>(null)

  useEffect(() => {
    fetch("/api/backup/status")
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.dueDays != null) setDue({ days: data.dueDays, never: data.lastBackupAt == null })
      })
      .catch(() => {})
  }, [])

  if (!due) return null

  function later() {
    setDue(null)
    fetch("/api/backup/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snooze: true }),
    }).catch(() => {})
  }

  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          {due.never ? t("backup.remind.never") : t("backup.remind.days", { count: due.days })}
        </p>
        <div className="flex gap-2">
          <Button size="sm" asChild>
            <Link href="/settings#backup">{t("backup.remind.now")}</Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={later}>{t("backup.remind.later")}</Button>
        </div>
      </CardContent>
    </Card>
  )
}
