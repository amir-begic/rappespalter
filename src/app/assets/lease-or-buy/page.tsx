"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { LeaseVsBuy } from "@/components/lease-vs-buy"
import { useT } from "@/lib/i18n/provider"

export default function LeaseOrBuyPage() {
  const { t } = useT()
  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <Link href="/assets" className="inline-flex items-center gap-1 text-xs uppercase text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="size-3" /> {t("as.back")}
      </Link>
      <div className="mb-8">
        <p className="text-xs uppercase text-muted-foreground mb-2">{t("nav.section.wealth")}</p>
        <h1>{t("lvb.title")}</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {t("lvb.pageIntro")}
        </p>
      </div>
      <div className="space-y-4">
        <LeaseVsBuy />
      </div>
    </div>
  )
}
