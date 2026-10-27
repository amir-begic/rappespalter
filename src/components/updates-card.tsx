"use client"

import { useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useUpdates } from "@/lib/updates"

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short" })

const fmtMb = (bytes: number) => (bytes / 1024 / 1024).toLocaleString("de-CH", { maximumFractionDigits: 1 })

function Spinner() {
  return <div className="h-4 w-4 shrink-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
}

// Settings → Updates: the running version, checking the promoted release and
// installing it (electron/updater.js + installUpdate in electron/main.js).
export function UpdatesCard() {
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
        <CardTitle className="text-sm font-medium text-muted-foreground">Updates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!supported ? (
          <p className="text-xs text-muted-foreground">
            Updates come with the installed desktop app.
          </p>
        ) : !state ? null : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Running</dt>
              <dd>Rappespalter {state.current}</dd>
              {state.lastCheck && (
                <>
                  <dt className="text-muted-foreground">Last checked</dt>
                  <dd>{fmtTime(state.lastCheck)}</dd>
                </>
              )}
            </dl>

            {!state.configured ? (
              <p className="text-xs text-muted-foreground">
                Updates aren&apos;t set up for this copy. The Windows installer sets them up; a development copy has none.
              </p>
            ) : (
              <>
                {status?.state === "failed" && (
                  <p className="text-xs text-negative">
                    The update to {status.version ?? "the new version"} didn&apos;t work: {status.message}
                  </p>
                )}
                {status?.state === "succeeded" && status.version === state.current && status.time && (
                  <p className="text-xs text-positive">
                    ✓ Updated from {status.from} to {status.version} on {fmtTime(status.time)}.
                    {status.backup && <> Your database from before is in <code className="break-all">{status.backup}</code>.</>}
                  </p>
                )}

                {state.download ? (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground" role="status">
                    <Spinner />
                    Downloading {state.available?.version}…{" "}
                    {state.download.total > 0 &&
                      `${fmtMb(state.download.received)} of ${fmtMb(state.download.total)} MB`}
                  </div>
                ) : state.installing ? (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground" role="status">
                    <Spinner />
                    Installing. Rappespalter closes and starts again in a moment.
                  </div>
                ) : state.available ? (
                  <div className="rounded-md border border-border p-3 space-y-2">
                    <p className="font-medium">Rappespalter {state.available.version} is available</p>
                    {state.available.notes && (
                      <p className="text-xs text-muted-foreground whitespace-pre-line">{state.available.notes}</p>
                    )}
                    <div className="flex items-center gap-3">
                      <Button size="sm" onClick={() => install()}>Install update</Button>
                      {state.available.page && (
                        <a href={state.available.page} target="_blank" rel="noreferrer"
                           className="text-xs text-muted-foreground underline underline-offset-4">
                          Release page
                        </a>
                      )}
                    </div>
                  </div>
                ) : state.upToDate ? (
                  <p className="text-xs text-muted-foreground">Rappespalter is up to date.</p>
                ) : null}

                {state.unreachable && (
                  <p className="text-xs text-highlight">Couldn&apos;t reach the update server. Is this computer online?</p>
                )}
                {state.error && <p className="text-xs text-destructive">{state.error}</p>}

                {!busy && (
                  <Button variant="outline" size="sm" onClick={() => check()} disabled={state.checking}>
                    {state.checking ? "Checking..." : "Check for updates"}
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
