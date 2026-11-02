"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { LeaseVsBuy } from "@/components/lease-vs-buy"

export default function LeaseOrBuyPage() {
  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <Link href="/assets" className="inline-flex items-center gap-1 text-xs uppercase text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="size-3" /> Assets
      </Link>
      <div className="mb-8">
        <p className="text-xs uppercase text-muted-foreground mb-2">Wealth</p>
        <h1>Lease or buy?</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Put in the dealer&apos;s offers and see what each way of getting the car costs you a month.
          Once you have the car, add it under Assets — its page compares again with your real numbers.
        </p>
      </div>
      <div className="space-y-4">
        <LeaseVsBuy />
      </div>
    </div>
  )
}
