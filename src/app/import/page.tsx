"use client"

import { IMPORT_SOURCES, ImportCard } from "@/components/import-card"

export default function ImportPage() {
  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="mb-8">
        <p className="text-xs uppercase text-muted-foreground mb-2">
          Import
        </p>
        <h1>
          Upload your data
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Pick the export that matches your account. Re-uploading the same file is
          safe — anything already imported is skipped automatically.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        {IMPORT_SOURCES.map(source => <ImportCard key={source.id} source={source} />)}
      </div>
    </div>
  )
}
