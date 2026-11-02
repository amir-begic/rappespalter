import { blob } from "@/lib/blob"
import type { GoalKind } from "@/lib/goals"

// One small flat illustration per goal kind, in the style of the page blobs: an
// ink-blot backdrop in a pop colour with a simple motif on top. Ink and paper
// are fixed colours so the art reads the same in light and dark mode.

const INK   = "oklch(0.22 0.02 280)"
const PAPER = "oklch(0.98 0.01 90)"
const C = {
  blue:   "var(--pop-blue)",
  green:  "var(--pop-green)",
  red:    "var(--pop-red)",
  yellow: "var(--pop-yellow)",
  pink:   "var(--pop-pink)",
}

const ink = { stroke: INK, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const

// A four-pointed sparkle centred on (x, y).
const sparkle = (x: number, y: number, r: number, fill = PAPER) => (
  <path d={`M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z`} fill={fill} />
)

const ART: Record<GoalKind, { seed: number; color: string; motif: React.ReactNode }> = {
  home: {
    seed: 7, color: C.green,
    motif: <>
      <rect x="71" y="30" width="8" height="16" rx="1.5" fill={INK} />
      <path d="M30 57 L60 31 L90 57 Z" fill={INK} {...{ stroke: INK, strokeWidth: 4, strokeLinejoin: "round" }} />
      <rect x="36" y="55" width="48" height="35" rx="3" fill={PAPER} />
      <path d="M54 90 V74 a6 6 0 0 1 12 0 V90 Z" fill={C.yellow} />
      <rect x="40" y="62" width="10" height="10" rx="2" fill={C.blue} />
      <rect x="70" y="62" width="10" height="10" rx="2" fill={C.blue} />
      <rect x="26" y="88" width="68" height="4" rx="2" fill={INK} />
    </>,
  },
  travel: {
    seed: 19, color: C.blue,
    motif: <>
      <path d="M50 41 V35 a4 4 0 0 1 4 -4 h12 a4 4 0 0 1 4 4 V41" {...ink} strokeWidth={5} />
      <rect x="32" y="40" width="56" height="42" rx="8" fill={C.red} />
      <rect x="44" y="40" width="5" height="42" fill={INK} />
      <rect x="71" y="40" width="5" height="42" fill={INK} />
      <circle cx="60" cy="58" r="7" fill={C.yellow} />
      <circle cx="60" cy="58" r="3" fill={PAPER} />
      <circle cx="42" cy="87" r="4" fill={INK} />
      <circle cx="78" cy="87" r="4" fill={INK} />
      {sparkle(92, 32, 6)}
    </>,
  },
  wedding: {
    seed: 29, color: C.pink,
    motif: <>
      <circle cx="51" cy="68" r="16" {...ink} strokeWidth={6} />
      <circle cx="71" cy="68" r="16" fill="none" stroke={C.yellow} strokeWidth={6} />
      <path d="M51 41 L58 47 L51 53 L44 47 Z" fill={PAPER} {...{ stroke: INK, strokeWidth: 2.5, strokeLinejoin: "round" }} />
      {sparkle(86, 38, 7)}
      {sparkle(30, 44, 4)}
    </>,
  },
  car: {
    seed: 41, color: C.yellow,
    motif: <>
      <path d="M40 58 L47 43 H71 L82 58 Z" fill={C.red} {...{ stroke: C.red, strokeWidth: 4, strokeLinejoin: "round" }} />
      <rect x="24" y="56" width="72" height="22" rx="9" fill={C.red} />
      <path d="M50 47 H58 V56 H45 Z" fill={PAPER} />
      <path d="M62 47 H69 L76 56 H62 Z" fill={PAPER} />
      <circle cx="90" cy="64" r="2.5" fill={PAPER} />
      <circle cx="42" cy="79" r="9" fill={INK} />
      <circle cx="42" cy="79" r="3.5" fill={PAPER} />
      <circle cx="78" cy="79" r="9" fill={INK} />
      <circle cx="78" cy="79" r="3.5" fill={PAPER} />
    </>,
  },
  safety: {
    seed: 53, color: C.red,
    motif: <>
      <path d="M28 62 A32 32 0 0 1 92 62 Q84 56 76 62 Q68 56 60 62 Q52 56 44 62 Q36 56 28 62 Z" fill={C.yellow} />
      <path d="M60 31 Q50 44 44 61 M60 31 Q70 44 76 61" {...ink} strokeWidth={2} opacity={0.5} />
      <path d="M60 30 V84 a6 6 0 0 1 -12 0" {...ink} strokeWidth={5} />
      <circle cx="60" cy="28" r="3" fill={INK} />
      <path d="M34 78 q-3 5 0 7 q3 -2 0 -7Z" fill={PAPER} />
      <path d="M88 74 q-3 5 0 7 q3 -2 0 -7Z" fill={PAPER} />
    </>,
  },
  study: {
    seed: 61, color: C.green,
    motif: <>
      <path d="M40 58 V73 q20 10 40 0 V58" fill={C.blue} />
      <path d="M60 34 L96 50 L60 66 L24 50 Z" fill={INK} {...{ stroke: INK, strokeWidth: 3, strokeLinejoin: "round" }} />
      <path d="M60 50 L86 54 V72" fill="none" stroke={C.yellow} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <rect x="83" y="71" width="6" height="11" rx="2" fill={C.yellow} />
      <circle cx="60" cy="50" r="3" fill={C.yellow} />
    </>,
  },
  family: {
    seed: 73, color: C.yellow,
    motif: <>
      <path d="M34 60 A26 26 0 0 1 60 34 V60 Z" fill={C.blue} />
      <rect x="32" y="58" width="56" height="20" rx="10" fill={C.red} />
      <path d="M86 60 L95 40 H101" {...ink} strokeWidth={5} />
      <circle cx="44" cy="86" r="7" fill={INK} />
      <circle cx="76" cy="86" r="7" fill={INK} />
      <path d="M76 44 c-4 -6 -12 -1 -7 5 l7 6 l7 -6 c5 -6 -3 -11 -7 -5Z" fill={PAPER} />
    </>,
  },
  other: {
    seed: 83, color: C.red,
    motif: <>
      <path
        d="M60 32 L67.6 51.5 L88.5 52.7 L72.3 66 L77.6 86.3 L60 75 L42.4 86.3 L47.7 66 L31.5 52.7 L52.4 51.5 Z"
        fill={C.yellow} {...{ stroke: INK, strokeWidth: 3, strokeLinejoin: "round" }}
      />
      {sparkle(90, 34, 6)}
      {sparkle(30, 84, 4)}
    </>,
  },
}

export function GoalArt({ kind, className }: { kind: GoalKind; className?: string }) {
  const art = ART[kind] ?? ART.other
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <path d={blob(art.seed, 8, 48, 7)} transform="translate(60 62)" fill={art.color} />
      {art.motif}
    </svg>
  )
}

// The backdrop colour of a kind's illustration, used for the goal elsewhere
// (progress bars, the asset split).
export const goalColor = (kind: GoalKind) => (ART[kind] ?? ART.other).color
