import { blob } from "@/lib/blob"
import type { AssetKind } from "@/lib/assets"

// One small flat illustration per asset kind, drawn like the goal illustrations
// (components/goal-art.tsx): an ink-blot backdrop in the kind's colour with a
// motif on top. Collectibles pick their motif from the collection's sub-type.

const INK   = "oklch(0.22 0.02 280)"
const PAPER = "oklch(0.98 0.01 90)"
const GOLD  = "oklch(0.74 0.15 75)"
const C = {
  blue:   "var(--pop-blue)",
  green:  "var(--pop-green)",
  red:    "var(--pop-red)",
  yellow: "var(--pop-yellow)",
  pink:   "var(--pop-pink)",
}

const outline = (w = 3) => ({ stroke: INK, strokeWidth: w, strokeLinejoin: "round" as const, strokeLinecap: "round" as const })

const sparkle = (x: number, y: number, r: number, fill = PAPER) => (
  <path d={`M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z`} fill={fill} />
)

const bar = (x: number, y: number) => (
  <g>
    <path d={`M${x} ${y + 14} L${x + 6} ${y} H${x + 28} L${x + 34} ${y + 14} Z`} fill={GOLD} {...outline()} />
    <path d={`M${x + 9} ${y + 4} H${x + 18}`} stroke={PAPER} strokeWidth={2.5} strokeLinecap="round" />
  </g>
)

const MOTIFS = {
  gold: <>
    {bar(26, 70)}{bar(60, 70)}{bar(43, 54)}
    {sparkle(88, 40, 7)}
    {sparkle(30, 46, 4)}
  </>,
  crypto: <>
    <circle cx="60" cy="61" r="25" fill={C.yellow} {...outline(4)} />
    <circle cx="60" cy="61" r="18" fill="none" stroke={INK} strokeWidth={1.5} strokeDasharray="3 4" />
    <path d="M54 50 V72 M54 50 H63 a5.5 5.5 0 0 1 0 11 H54 M54 61 H64 a5.5 5.5 0 0 1 0 11 H54" fill="none" {...outline(3.5)} />
    <path d="M57 46 V50 M62 46 V50 M57 72 V76 M62 72 V76" {...outline(3)} />
    {sparkle(92, 36, 6)}
  </>,
  card: <>
    <rect x="44" y="30" width="38" height="54" rx="5" fill={C.blue} transform="rotate(12 63 57)" {...outline()} />
    <rect x="34" y="34" width="38" height="54" rx="5" fill={PAPER} transform="rotate(-8 53 61)" {...outline()} />
    <g transform="rotate(-8 53 61)">
      <rect x="39" y="39" width="28" height="22" rx="2" fill={C.red} />
      <path d="M53 43 L55.6 48.4 L61.5 49 L57 53 L58.3 58.8 L53 55.8 L47.7 58.8 L49 53 L44.5 49 L50.4 48.4 Z" fill={C.yellow} />
      <path d="M40 68 H66 M40 74 H58 M40 80 H62" stroke={INK} strokeWidth={2} strokeLinecap="round" opacity={0.5} />
    </g>
    {sparkle(90, 34, 7)}
  </>,
  watch: <>
    <rect x="50" y="28" width="20" height="64" rx="6" fill={INK} />
    <circle cx="60" cy="60" r="20" fill={PAPER} {...outline(5)} />
    <path d="M60 60 V48 M60 60 L68 64" {...outline(3)} />
    <circle cx="60" cy="60" r="2.5" fill={C.red} />
    <rect x="80" y="57" width="5" height="6" rx="1.5" fill={INK} />
    {sparkle(30, 40, 5)}
  </>,
  wine: <>
    <path d="M54 30 H66 V44 q10 6 10 18 V88 a3 3 0 0 1 -3 3 H47 a3 3 0 0 1 -3 -3 V62 q0 -12 10 -18 Z" fill={C.red} {...outline()} />
    <rect x="44" y="64" width="32" height="16" fill={PAPER} {...outline(2)} />
    <path d="M50 72 H70" stroke={INK} strokeWidth={2} strokeLinecap="round" opacity={0.6} />
    <rect x="54" y="28" width="12" height="6" rx="1.5" fill={INK} />
    {sparkle(88, 40, 6)}
  </>,
  art: <>
    <rect x="28" y="36" width="64" height="50" rx="3" fill={C.yellow} {...outline(4)} />
    <rect x="35" y="43" width="50" height="36" fill={PAPER} />
    <path d="M35 79 L50 60 L60 70 L68 62 L85 79 Z" fill={C.green} />
    <circle cx="74" cy="52" r="5" fill={C.red} />
  </>,
  gem: <>
    <path d="M40 46 L50 34 H70 L80 46 L60 88 Z" fill={C.blue} {...outline()} />
    <path d="M40 46 H80 M50 34 L56 46 L60 88 M70 34 L64 46 L60 88" fill="none" {...outline(2)} />
    <path d="M52 38 L49 44" stroke={PAPER} strokeWidth={3} strokeLinecap="round" />
    {sparkle(88, 34, 7)}
    {sparkle(32, 78, 4)}
  </>,
  vehicle: <>
    <path d="M40 58 L47 43 H71 L82 58 Z" fill={C.blue} {...{ stroke: C.blue, strokeWidth: 4, strokeLinejoin: "round" }} />
    <rect x="24" y="56" width="72" height="22" rx="9" fill={C.blue} />
    <path d="M50 47 H58 V56 H45 Z" fill={PAPER} />
    <path d="M62 47 H69 L76 56 H62 Z" fill={PAPER} />
    <circle cx="90" cy="64" r="2.5" fill={C.yellow} />
    <circle cx="42" cy="79" r="9" fill={INK} />
    <circle cx="42" cy="79" r="3.5" fill={PAPER} />
    <circle cx="78" cy="79" r="9" fill={INK} />
    <circle cx="78" cy="79" r="3.5" fill={PAPER} />
  </>,
} as const

type Motif = keyof typeof MOTIFS

const KIND_ART: Record<AssetKind, { seed: number; color: string; motif: Motif }> = {
  gold:        { seed: 11, color: C.yellow, motif: "gold" },
  crypto:      { seed: 23, color: C.blue,   motif: "crypto" },
  collectible: { seed: 37, color: C.pink,   motif: "card" },
  vehicle:     { seed: 47, color: C.red,    motif: "vehicle" },
  other:       { seed: 59, color: C.green,  motif: "gem" },
}

const COLLECTION_MOTIF: Record<string, Motif> = {
  "Watches": "watch", "Wine": "wine", "Art": "art", "Sneakers": "gem", "LEGO": "gem", "Other": "gem",
}

export function AssetArt({ kind, subtype, className }: { kind: AssetKind; subtype?: string | null; className?: string }) {
  const art = KIND_ART[kind] ?? KIND_ART.other
  const motif = kind === "collectible" && subtype ? COLLECTION_MOTIF[subtype] ?? art.motif : art.motif
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <path d={blob(art.seed, 8, 48, 7)} transform="translate(60 62)" fill={art.color} />
      {MOTIFS[motif]}
    </svg>
  )
}

// The backdrop colour of a kind, used for it in charts and bars.
export const assetColor = (kind: AssetKind) => (KIND_ART[kind] ?? KIND_ART.other).color
