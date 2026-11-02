"use client"

import { useEffect, useRef } from "react"
import { motionReduced } from "@/lib/appearance"

// Flat ink-blot shapes peeking in from the page edges. Each one slowly changes shape
// (SVG <animate> between variants of the same outline) while drifting and turning
// (globals.css .blob). Purely decorative: fixed behind everything, never takes clicks.

// Seeded random, so the shapes are the same on every render (and server = client).
function random(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

// A closed blob through `points` points around a circle, each pushed in or out a
// little, smoothed with Catmull-Rom curves. Same seed → same point count and
// command structure, which is what lets <animate> morph between variants.
function blob(seed: number, points = 8, radius = 70, wobble = 14) {
  const rnd = random(seed)
  const pts = Array.from({ length: points }, (_, i) => {
    const a = (i / points) * Math.PI * 2
    const r = radius + (rnd() * 2 - 1) * wobble
    return [Math.cos(a) * r, Math.sin(a) * r]
  })
  const p = (i: number) => pts[(i + points) % points]
  const f = (n: number) => n.toFixed(1)
  let d = `M${f(p(0)[0])},${f(p(0)[1])}`
  for (let i = 0; i < points; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`
  }
  return d + "Z"
}

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
