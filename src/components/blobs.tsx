"use client"

import { useEffect, useRef } from "react"
import { motionReduced } from "@/lib/appearance"
import { blob } from "@/lib/blob"

// Flat ink-blot shapes peeking in from the page edges. Each one slowly changes shape
// (SVG <animate> between variants of the same outline) while drifting and turning
// (globals.css .blob). Purely decorative: fixed behind everything, never takes clicks.

const PLACEMENT = [
  { seed: 11, color: "var(--pop-yellow)", morph: "19s", className: "-top-40 -right-32 size-[30rem]" },
  { seed: 23, color: "var(--pop-pink)", morph: "23s", className: "-bottom-48 -left-40 size-[34rem]" },
  { seed: 37, color: "var(--pop-blue)", morph: "17s", className: "top-[45%] -right-24 size-56" },
]

// Four shapes per blob, looping back to the first; eased between each.
const VARIANTS = 4
const SPLINE = Array(VARIANTS).fill("0.45 0 0.55 1").join(";")
const TIMES = Array.from({ length: VARIANTS + 1 }, (_, i) => +(i / VARIANTS).toFixed(3)).join(";")

export function Blobs() {
  const root = useRef<HTMLDivElement>(null)

  // CSS can't stop SVG <animate>, so honour reduced motion here: the setting on
  // <html> (Settings → Appearance) and, for "system", the OS preference. Both can
  // change while the page is open.
  useEffect(() => {
    const html = document.documentElement
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const apply = () => {
      const reduce = motionReduced(html.dataset.motion)
      root.current?.querySelectorAll("svg").forEach(svg =>
        reduce ? svg.pauseAnimations() : svg.unpauseAnimations())
    }
    apply()
    query.addEventListener("change", apply)
    const observer = new MutationObserver(apply)
    observer.observe(html, { attributes: true, attributeFilter: ["data-motion"] })
    return () => {
      query.removeEventListener("change", apply)
      observer.disconnect()
    }
  }, [])

  return (
    <div ref={root} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {PLACEMENT.map(({ seed, color, morph, className }) => {
        const shapes = Array.from({ length: VARIANTS }, (_, v) => blob(seed * 100 + v))
        return (
          <svg key={seed} viewBox="-100 -100 200 200" className={`blob absolute ${className}`}>
            <path d={shapes[0]} fill={color}>
              <animate
                attributeName="d"
                dur={morph}
                repeatCount="indefinite"
                values={[...shapes, shapes[0]].join(";")}
                keyTimes={TIMES}
                calcMode="spline"
                keySplines={SPLINE}
              />
            </path>
          </svg>
        )
      })}
    </div>
  )
}
