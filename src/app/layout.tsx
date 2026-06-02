import type { Metadata } from "next"
import { Geist } from "next/font/google"
import "./globals.css"
import Link from "next/link"

const geist = Geist({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Rappespalter",
  description: "Personal finance dashboard",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${geist.className} antialiased`}>
        <nav className="border-b border-border sticky top-0 z-50 bg-background">
          <div className="max-w-4xl mx-auto px-4 flex items-center gap-1 h-12 overflow-x-auto">
            <span className="text-xs tracking-widest uppercase text-muted-foreground mr-4">
              Rappespalter
            </span>
            <Link
              href="/dashboard"
              className="text-xs tracking-widest uppercase px-3 py-1.5 rounded hover:bg-muted transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/import"
              className="text-xs tracking-widest uppercase px-3 py-1.5 rounded hover:bg-muted transition-colors"
            >
              Import
            </Link>
            <Link
              href="/budgets"
              className="text-xs tracking-widest uppercase px-3 py-1.5 rounded hover:bg-muted transition-colors"
            >
              Budgets
            </Link>
            <Link
              href="/networth"
              className="text-xs tracking-widest uppercase px-3 py-1.5 rounded hover:bg-muted transition-colors whitespace-nowrap"
            >
              Net Worth
            </Link>
            <Link
              href="/trends"
              className="text-xs tracking-widest uppercase px-3 py-1.5 rounded hover:bg-muted transition-colors"
            >
              Trends
            </Link>
            <Link
              href="/goal"
              className="text-xs tracking-widest uppercase px-3 py-1.5 rounded hover:bg-muted transition-colors"
            >
              Goal
            </Link>
            <Link
            href="/projections"
            className="text-xs tracking-widest uppercase px-3 py-1.5 rounded hover:bg-muted transition-colors"
          >
            Projections
          </Link>
            <Link
              href="/income"
              className="text-xs tracking-widest uppercase px-3 py-1.5 rounded hover:bg-muted transition-colors"
            >
              Income
            </Link>
            <Link
              href="/data"
              className="text-xs tracking-widest uppercase px-3 py-1.5 rounded hover:bg-muted transition-colors"
            >
              Data
            </Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  )
}