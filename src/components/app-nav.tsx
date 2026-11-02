"use client"

import Link from "next/link"
import { Moon, Sun } from "lucide-react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useUpdates } from "@/lib/updates"
import { saveAppearance } from "@/lib/appearance"

type NavItem = { href: string; label: string }

// Each section has a colour from the palette; its current page is a pill in it.
const SECTIONS: { title: string; color: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    color: "bg-pop-blue",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/trends",    label: "Trends" },
      { href: "/income",    label: "Income" },
    ],
  },
  {
    title: "Planning",
    color: "bg-pop-green",
    items: [
      { href: "/budgets",     label: "Budgets" },
      { href: "/goal",        label: "Goal" },
      { href: "/networth",    label: "Net Worth" },
      { href: "/portfolio",   label: "Portfolio" },
      { href: "/projections", label: "Projections" },
    ],
  },
  {
    title: "Data",
    color: "bg-pop-red",
    items: [
      { href: "/import",   label: "Import" },
      { href: "/data",     label: "Data" },
      { href: "/settings", label: "Settings" },
    ],
  },
]

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
  return <span className="size-1.5 rounded-full bg-pop-yellow" aria-label="Update available" />
}

// The mark from the app icon: a coin split in two, the halves knocked slightly apart.
function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <path d="M14.5 4a12 12 0 0 0 0 24z" className="fill-pop-blue" />
      <path d="M17.5 6.5a12 12 0 0 1 0 24z" className="fill-pop-yellow" />
    </svg>
  )
}

function Brand() {
  return (
    <Link href="/dashboard" className="group flex shrink-0 items-center gap-2">
      <Mark className="size-7 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:rotate-[20deg]" />
      <span className="font-display text-xl tracking-tight">Rappespalter</span>
    </Link>
  )
}

// Light (the default) or dark, saved with the other appearance settings (Settings →
// Appearance); the page switches at once. The theme lives on <html>, so CSS picks the icon.
function ThemeToggle() {
  const toggle = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark"
    saveAppearance({ theme: next }).catch(err => console.error(err))
  }
  return (
    <button
      type="button"
      onClick={toggle}
      className="ml-auto flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      aria-label="Switch between dark and light theme"
      title="Dark / light"
    >
      <Sun className="size-4 hidden dark:block" strokeWidth={1.5} />
      <Moon className="size-4 dark:hidden" strokeWidth={1.5} />
    </button>
  )
}

function NavLinks({ className }: { className?: string }) {
  const isActive = useIsActive()
  const hasBadge = useBadges()
  return (
    <nav className={className}>
      {SECTIONS.map(section => (
        <div key={section.title} className="flex shrink-0 items-center gap-0.5">
          {section.items.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 pt-1.5 pb-[0.3rem] text-[0.6875rem] uppercase transition-colors duration-200",
                isActive(href)
                  ? `${section.color} text-white`
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {label}
              {hasBadge(href) && <UpdateDot />}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}

// One bar across the top: wordmark, the pages grouped by section, theme toggle.
// Below xl the pages move to a scrollable second row.
export function TopNav() {
  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 lg:px-6">
        <Brand />
        <NavLinks className="hidden xl:flex items-center gap-4" />
        <ThemeToggle />
      </div>
      <NavLinks className="xl:hidden flex items-center gap-4 overflow-x-auto px-3 pb-2 [scrollbar-width:none]" />
    </header>
  )
}
