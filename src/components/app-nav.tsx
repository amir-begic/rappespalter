"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, ChartLine, Wallet, PiggyBank, Target, Landmark,
  ChartArea, ChartCandlestick, Upload, Database, Settings, type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useUpdates } from "@/lib/updates"

type NavItem = { href: string; label: string; icon: LucideIcon }

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/trends",    label: "Trends",    icon: ChartLine },
      { href: "/income",    label: "Income",    icon: Wallet },
    ],
  },
  {
    title: "Planning",
    items: [
      { href: "/budgets",     label: "Budgets",     icon: PiggyBank },
      { href: "/goal",        label: "Goal",        icon: Target },
      { href: "/networth",    label: "Net Worth",   icon: Landmark },
      { href: "/portfolio",   label: "Portfolio",   icon: ChartCandlestick },
      { href: "/projections", label: "Projections", icon: ChartArea },
    ],
  },
  {
    title: "Data",
    items: [
      { href: "/import",   label: "Import",   icon: Upload },
      { href: "/data",     label: "Data",     icon: Database },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
]

const ALL_ITEMS = SECTIONS.flatMap(s => s.items)

function useIsActive() {
  const pathname = usePathname()
  return (href: string) => pathname === href || pathname.startsWith(href + "/")
}

// A dot on Settings while a newer version waits to be installed (Settings → Updates).
function useBadges() {
  const { state } = useUpdates()
  return (href: string) => href === "/settings" && Boolean(state?.available)
}

function UpdateDot() {
  return <span className="ml-auto size-1.5 rounded-full bg-info" aria-label="Update available" />
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" width={26} height={26} className="rounded-md" />
      <span className="font-semibold tracking-tight">Rappespalter</span>
    </Link>
  )
}

// Fixed left sidebar on md+ screens.
export function Sidebar() {
  const isActive = useIsActive()
  const hasBadge = useBadges()
  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 w-56 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="h-14 flex items-center px-3">
        <Brand />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-6 space-y-6 pt-2">
        {SECTIONS.map(section => (
          <div key={section.title}>
            <p className="px-2 mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={isActive(href) ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                      isActive(href)
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={isActive(href) ? 2.25 : 1.75} />
                    {label}
                    {hasBadge(href) && <UpdateDot />}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}

// Compact top bar with a scrollable tab strip on small screens.
export function MobileNav() {
  const isActive = useIsActive()
  const hasBadge = useBadges()
  return (
    <header className="md:hidden sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur">
      <div className="h-12 flex items-center px-3">
        <Brand />
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
        {ALL_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-xs transition-colors",
              isActive(href)
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" />
            {label}
            {hasBadge(href) && <UpdateDot />}
          </Link>
        ))}
      </nav>
    </header>
  )
}
