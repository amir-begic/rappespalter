"use client"

import { IMPORT_SOURCES, ImportCard } from "@/components/import-card"
import { useT } from "@/lib/i18n/provider"

export default function ImportPage() {
  const { t } = useT()
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
        {IMPORT_SOURCES.map(source => <ImportCard key={source.id} source={source} />)}
      </div>
    </div>
  )
}
