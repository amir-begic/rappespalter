"use client"

import { useState } from "react"
import { IMPORT_SOURCES, ImportCard } from "@/components/import-card"
import { RecentImports } from "@/components/recent-imports"
import { useT } from "@/lib/i18n/provider"

export default function ImportPage() {
  const { t } = useT()
  const [imported, setImported] = useState(0) // reloads the recent imports
  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="mb-8">
        <p className="text-xs uppercase text-muted-foreground mb-2">
          {t("import.label")}
        </p>
        <h1>
          {t("import.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          {t("import.intro")}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        {IMPORT_SOURCES.map(source => (
          <ImportCard key={source.id} source={source} onImported={() => setImported(n => n + 1)} />
        ))}
      </div>

      <RecentImports refreshKey={imported} />
    </div>
  )
}
