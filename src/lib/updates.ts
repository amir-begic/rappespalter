// Updates of the desktop app, as the Electron main process reports them
// (electron/updater.js, bridged by electron/preload.js). In a browser or `pnpm dev`
// there's no bridge, so `supported` is false.

import { useEffect, useState, useSyncExternalStore } from "react"

export type UpdateStatus = {
  state: "installing" | "succeeded" | "failed"
  from?: string
  version?: string
  message?: string
  backup?: string | null
  time?: string
}

export type UpdateState = {
  configured: boolean
  current: string
  lastCheck: string | null
  checking: boolean
  unreachable: boolean
  upToDate: boolean
  available: { version: string; notes: string; page: string | null; published: string | null; size: number } | null
  download: { received: number; total: number } | null
  installing: boolean
  error: string | null
  status: UpdateStatus | null
}

type UpdatesBridge = {
  state: () => Promise<UpdateState | null>
  check: () => Promise<UpdateState | null>
  install: () => Promise<UpdateState | null>
  onChange: (fn: (state: UpdateState) => void) => () => void
}

declare global {
  interface Window {
    rappespalter?: { updates: UpdatesBridge }
  }
}

const bridge = () => (typeof window === "undefined" ? undefined : window.rappespalter?.updates)

// The bridge never comes or goes; the server render (and hydration) says false.
const noSubscribe = () => () => {}

export function useUpdates() {
  const supported         = useSyncExternalStore(noSubscribe, () => Boolean(bridge()), () => false)
  const [state, setState] = useState<UpdateState | null>(null)

  useEffect(() => {
    const updates = bridge()
    if (!updates) return
    updates.state().then(s => s && setState(s))
    return updates.onChange(setState)
  }, [])

  return {
    supported,
    state,
    check:   () => bridge()?.check().then(s => s && setState(s)),
    install: () => bridge()?.install(),
  }
}
