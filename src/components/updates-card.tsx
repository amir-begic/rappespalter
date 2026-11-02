"use client"

import { useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useUpdates } from "@/lib/updates"
import { useT } from "@/lib/i18n/provider"

function Spinner() {
  return <div className="h-4 w-4 shrink-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
}

// Settings → Updates: the running version, checking the promoted release and
// installing it (electron/updater.js + installUpdate in electron/main.js).
export function UpdatesCard() {
  const { t, rich, locale } = useT()
  const fmtTime = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
  const fmtMb = (bytes: number) => (bytes / 1024 / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })
  const { supported, state, check, install } = useUpdates()
  const checkedOnOpen = useRef(false)

  // Opening Settings checks right away if nothing has been checked since start.
  useEffect(() => {
    if (state?.configured && !state.lastCheck && !state.checking && !checkedOnOpen.current) {
      checkedOnOpen.current = true
      check()
    }
  }, [state, check])

  const status  = state?.status
  const busy    = Boolean(state?.download || state?.installing)

  return (
    <Card id="updates">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{t("updates.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!supported ? (
          <p className="text-xs text-muted-foreground">
            {t("updates.desktopOnly")}
          </p>
        ) : !state ? null : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              <dt className="text-muted-foreground">{t("updates.running")}</dt>
              <dd>Rappespalter {state.current}</dd>
              {state.lastCheck && (
                <>
                  <dt className="text-muted-foreground">{t("updates.lastChecked")}</dt>
                  <dd>{fmtTime(state.lastCheck)}</dd>
                </>
              )}
            </dl>

            {!state.configured ? (
              <p className="text-xs text-muted-foreground">
                {t("updates.notConfigured")}
              </p>
            ) : (
              <>
                {status?.state === "failed" && (
                  <p className="text-xs text-negative">
                    {t("updates.failed", { version: status.version ?? t("updates.newVersion"), message: status.message ?? "" })}
                  </p>
                )}
                {status?.state === "succeeded" && status.version === state.current && status.time && (
                  <p className="text-xs text-positive">
                    {t("updates.succeeded", { from: status.from ?? "", version: status.version ?? "", time: fmtTime(status.time) })}
                    {status.backup && <>{" "}{rich("updates.backupNote", { path: text => <code className="break-all">{text}</code> }, { path: status.backup })}</>}
                  </p>
                )}

                {state.download ? (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground" role="status">
                    <Spinner />
                    {t("updates.downloading", { version: state.available?.version ?? "" })}{" "}
                    {state.download.total > 0 &&
                      t("updates.progress", { received: fmtMb(state.download.received), total: fmtMb(state.download.total) })}
                  </div>
                ) : state.installing ? (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground" role="status">
                    <Spinner />
                    {t("updates.installing")}
                  </div>
                ) : state.available ? (
                  <div className="rounded-md border border-border p-3 space-y-2">
                    <p>{t("updates.available", { version: state.available.version })}</p>
                    {state.available.notes && (
                      <p className="text-xs text-muted-foreground whitespace-pre-line">{state.available.notes}</p>
                    )}
                    <div className="flex items-center gap-3">
                      <Button size="sm" onClick={() => install()}>{t("updates.install")}</Button>
                      {state.available.page && (
                        <a href={state.available.page} target="_blank" rel="noreferrer"
                           className="text-xs text-muted-foreground underline underline-offset-4">
                          {t("updates.releasePage")}
                        </a>
                      )}
                    </div>
                  </div>
                ) : state.upToDate ? (
                  <p className="text-xs text-muted-foreground">{t("updates.upToDate")}</p>
                ) : null}

                {state.unreachable && (
                  <p className="text-xs text-highlight">{t("updates.unreachable")}</p>
                )}
                {state.error && <p className="text-xs text-destructive">{state.error}</p>}

                {!busy && (
                  <Button variant="outline" size="sm" onClick={() => check()} disabled={state.checking}>
                    {state.checking ? t("updates.checking") : t("updates.check")}
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
