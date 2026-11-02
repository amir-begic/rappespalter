"use client"

import { useT } from "@/lib/i18n/provider"

// Shown while a page fetches its data. It fades in only after a short delay
// (globals.css, .page-loading), so a quick load goes straight to the content
// instead of flashing a spinner first.
export function PageLoading({ label }: { label?: string }) {
  const { t } = useT()
  return (
    <div className="page-loading flex items-center gap-3 text-sm text-muted-foreground py-20 justify-center">
      <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      {label ?? t("common.loading")}
    </div>
  )
}
