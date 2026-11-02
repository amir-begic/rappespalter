"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Moon, Settings, Sun } from "lucide-react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useUpdates } from "@/lib/updates"
import { saveAppearance } from "@/lib/appearance"

type NavItem = { href: string; label: string }
type Section = { title: string; color: string; ink: string; dot: string; items: NavItem[] }

// Two tiers: the sections across the top bar, the current section's pages in a
// row below. Each section has a colour from the palette; its current page is a
// pill in it (`ink` is the text colour that reads on it).
const SECTIONS: Section[] = [
  {
    title: "Money",
    color: "bg-pop-blue", ink: "text-white", dot: "bg-pop-blue",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/trends",    label: "Trends" },
      { href: "/income",    label: "Income" },
      { href: "/budgets",   label: "Budgets" },
      { href: "/recurring", label: "Recurring" },
    ],
  },
  {
    title: "Wealth",
    color: "bg-pop-green", ink: "text-white", dot: "bg-pop-green",
    items: [
      { href: "/networth",  label: "Net Worth" },
      { href: "/assets",    label: "Assets" },
      { href: "/portfolio", label: "Portfolio" },
    ],
  },
  {
    title: "Planning",
    color: "bg-pop-yellow", ink: "text-[oklch(0.2_0.012_280)]", dot: "bg-pop-yellow",
    items: [
      { href: "/goal",        label: "Goals" },
      { href: "/projections", label: "Projections" },
      { href: "/tax",         label: "Tax" },
    ],
  },
  {
    title: "Data",
    color: "bg-pop-red", ink: "text-white", dot: "bg-pop-red",
    items: [
      { href: "/import",   label: "Import" },
      { href: "/review",   label: "Review" },
      { href: "/data",     label: "Data" },
    ],
  },
]

const isUnder = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/")

function useIsActive() {
  const pathname = usePathname()
  return (href: string) => isUnder(pathname, href)
}

// The page last visited in each section, so switching back to a section returns
// there. Lives as long as the window (module state survives client navigation).
const lastVisited = new Map<string, string>()

function useCurrentSection(): Section | null {
  const pathname = usePathname()
  const section = SECTIONS.find(s => s.items.some(i => isUnder(pathname, i.href))) ?? null
  useEffect(() => {
    if (section) lastVisited.set(section.title, section.items.find(i => isUnder(pathname, i.href))!.href)
  }, [section, pathname])
  return section
}

// How many recent transactions wait in the review inbox; re-checked on every
// navigation, so it follows imports and reviews.
function useReviewCount() {
  const pathname = usePathname()
  const [count, setCount] = useState(0)
  useEffect(() => {
    let stale = false
    fetch("/api/review?count=1")
      .then(r => r.json())
      .then(d => { if (!stale && typeof d.recent === "number") setCount(d.recent) })
      .catch(() => {})
    return () => { stale = true }
  }, [pathname])
  return count
}

function ReviewCount({ count }: { count: number }) {
  return (
    <span className="min-w-4 rounded-full bg-pop-red px-1 text-center text-[0.625rem] leading-4 text-white" aria-label={`${count} to review`}>
      {count > 99 ? "99+" : count}
    </span>
  )
}

function UpdateDot({ className }: { className?: string }) {
  return <span className={cn("size-1.5 rounded-full bg-pop-yellow", className)} aria-label="Update available" />
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

const ICON_BUTTON = "flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"

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
      className={ICON_BUTTON}
      aria-label="Switch between dark and light theme"
      title="Dark / light"
    >
      <Sun className="size-4 hidden dark:block" strokeWidth={1.5} />
      <Moon className="size-4 dark:hidden" strokeWidth={1.5} />
    </button>
  )
}

// Settings sits outside the sections, as a gear next to the theme toggle; a dot on
// it while a newer version waits to be installed (Settings → Updates).
function SettingsLink() {
  const { state } = useUpdates()
  const active = useIsActive()("/settings")
  return (
    <Link
      href="/settings"
      aria-current={active ? "page" : undefined}
      className={cn(ICON_BUTTON, "relative", active && "bg-accent text-foreground")}
      aria-label="Settings"
      title="Settings"
    >
      <Settings className="size-4" strokeWidth={1.5} />
      {state?.available && <UpdateDot className="absolute top-1.5 right-1.5" />}
    </Link>
  )
}

// The sections, as tabs in the top bar. Badges of a section's pages show on the
// section while you're elsewhere.
function SectionTabs({ current, className }: { current: Section | null; className?: string }) {
  const toReview = useReviewCount()
  return (
    <nav aria-label="Sections" className={className}>
      {SECTIONS.map(section => {
        const active = section === current
        const href = lastVisited.get(section.title) ?? section.items[0].href
        return (
          <Link
            key={section.title}
            href={href}
            aria-current={active ? "true" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 pt-1.5 pb-[0.3rem] text-xs uppercase transition-colors duration-200",
              active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <span className={cn("size-2 rounded-full", section.dot)} aria-hidden="true" />
            {section.title}
            {!active && section.items.some(i => i.href === "/review") && toReview > 0 && <ReviewCount count={toReview} />}
          </Link>
        )
      })}
    </nav>
  )
}

// The current section's pages.
function PageLinks({ section }: { section: Section }) {
  const isActive = useIsActive()
  const toReview = useReviewCount()
  return (
    <nav aria-label={section.title} className="mx-auto flex max-w-7xl items-center gap-0.5 overflow-x-auto px-3 pb-2 lg:px-5 [scrollbar-width:none]">
      {section.items.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 pt-1.5 pb-[0.3rem] text-[0.6875rem] uppercase transition-colors duration-200",
            isActive(href)
              ? `${section.color} ${section.ink}`
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          {label}
          {href === "/review" && toReview > 0 && !isActive(href) && <ReviewCount count={toReview} />}
        </Link>
      ))}
    </nav>
  )
}

// Top bar: wordmark, the sections, theme toggle and settings; below it the current section's
// pages. On narrow screens the sections move to their own scrollable row.
export function TopNav() {
  const current = useCurrentSection()
  // The first-start setup (/welcome) gets the bar without navigation.
  if (usePathname() === "/welcome") {
    return (
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 lg:px-6">
          <Brand />
          <div className="ml-auto"><ThemeToggle /></div>
        </div>
      </header>
    )
  }
  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 lg:px-6">
        <Brand />
        <SectionTabs current={current} className="hidden md:flex items-center gap-1" />
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <SettingsLink />
        </div>
      </div>
      <SectionTabs current={current} className="md:hidden flex items-center gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]" />
      {current && <PageLinks section={current} />}
    </header>
  )
}
