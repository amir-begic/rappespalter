// Draws the Windows installer's pictures from the desktop loading page, so the
// installer writes the name out the same way the app does when it starts:
//   build/installer/frames/f0.bmp … fN.bmp  the sidebar, one frame per 80 ms
//   build/installer/sidebar.bmp             the first frame (what NSIS shows first)
//   build/installer/sidebar-done.bmp        the last frame (uninstaller)
//   build/installer/header.bmp              the name, for the progress page header
//   build/installer/frames.nsh              RP_LAST_FRAME for installer.nsh
// Run by `pnpm dist` before electron-builder; the output is build output (not committed).
//
// Strokes, timings and blobs are read from electron/loading.html. librsvg (sharp)
// ignores pathLength, so each stroke's real length is measured here instead.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const out = join(root, "build", "installer")
const html = readFileSync(join(root, "electron", "loading.html"), "utf8")

const BG = "#f4f1ea", INK = "#2f4fe0", YELLOW = "#fbc93d", PINK = "#f0b6c8"
const FRAME_MS = 80 // keep in step with the timer in resources/installer/installer.nsh
const SIDEBAR = { width: 164, height: 314 } // MUI2 welcome/finish image
const HEADER = { width: 150, height: 57 } // MUI2 header image

// ── Read the loading page ──────────────────────────────────────────────────

const strokes = [...html.matchAll(/<path d="([^"]+)" pathLength="1" style="--d:([\d.]+)s;--t:([\d.]+)s"/g)]
  .map(([, d, delay, duration]) => ({ d, delay: Number(delay), duration: Number(duration) }))
const blobs = [...html.matchAll(/<svg class="blob (\w)"[^>]*>\s*<path d="([^"]+)"/g)]
  .reduce((all, [, name, d]) => ({ ...all, [name]: d }), {})
const viewBox = html.match(/<svg class="word" viewBox="([^"]+)"/)?.[1]
if (!strokes.length || !blobs.a || !blobs.b || !viewBox) {
  throw new Error("Couldn't read the strokes, blobs or viewBox from electron/loading.html")
}
const end = Math.max(...strokes.map(s => s.delay + s.duration))

// ── Stroke lengths (the paths use only absolute M, L and C) ────────────────

function pathLength(d) {
  let length = 0, x = 0, y = 0
  for (const [, cmd, args] of d.matchAll(/([MLC])([^MLC]*)/g)) {
    const n = (args.match(/-?\d*\.?\d+/g) ?? []).map(Number)
    if (cmd === "M") { [x, y] = n; continue }
    if (cmd === "L") { length += Math.hypot(n[0] - x, n[1] - y); [x, y] = n; continue }
    for (let i = 0; i + 5 < n.length; i += 6) {
      const [x1, y1, x2, y2, x3, y3] = n.slice(i, i + 6)
      let px = x, py = y
      for (let k = 1; k <= 64; k++) {
        const t = k / 64, u = 1 - t
        const qx = u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3
        const qy = u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3
        length += Math.hypot(qx - px, qy - py)
        px = qx; py = qy
      }
      x = x3; y = y3
    }
  }
  return length
}
for (const s of strokes) s.length = pathLength(s.d)

// The loading page's easing: cubic-bezier(0.45, 0.05, 0.55, 0.95).
function ease(p) {
  const [x1, y1, x2, y2] = [0.45, 0.05, 0.55, 0.95]
  const bez = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3
  let lo = 0, hi = 1
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (bez(mid, x1, x2) < p) lo = mid
    else hi = mid
  }
  return bez((lo + hi) / 2, y1, y2)
}

// ── Pictures ────────────────────────────────────────────────────────────────

// The name as written by `time` (seconds since the animation started).
function word(time) {
  return strokes.map(s => {
    const p = Math.min(1, Math.max(0, (time - s.delay) / s.duration))
    if (p === 0) return ""
    const drawn = ease(p) * s.length
    return `<path d="${s.d}" stroke-dasharray="${s.length} ${s.length * 2}" stroke-dashoffset="${s.length - drawn}"/>`
  }).join("")
}

const wordSvg = (time, x, y, width) => {
  const [, , w, h] = viewBox.split(" ").map(Number)
  return `<svg x="${x}" y="${y}" width="${width}" height="${(width * h) / w}" viewBox="${viewBox}" overflow="visible">
    <g fill="none" stroke="${INK}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${word(time)}</g></svg>`
}
const blob = (d, fill, x, y, size) =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="-100 -100 200 200"><path d="${d}" fill="${fill}"/></svg>`

const sidebar = time => `<svg xmlns="http://www.w3.org/2000/svg" width="${SIDEBAR.width}" height="${SIDEBAR.height}">
  <rect width="100%" height="100%" fill="${BG}"/>
  ${blob(blobs.a, YELLOW, 66, -78, 170)}
  ${blob(blobs.b, PINK, -86, 206, 190)}
  ${wordSvg(time, 14, 128, 136)}
</svg>`

const header = `<svg xmlns="http://www.w3.org/2000/svg" width="${HEADER.width}" height="${HEADER.height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${wordSvg(end, 14, 15, 122)}
</svg>`

// 24-bit Windows bitmap (what NSIS's image controls load).
async function bmp(svg, { width, height }) {
  const raw = await sharp(Buffer.from(svg), { density: 72 * 3 })
    .resize(width, height)
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer()
  const row = Math.ceil((width * 3) / 4) * 4
  const file = Buffer.alloc(54 + row * height)
  file.write("BM", 0)
  file.writeUInt32LE(file.length, 2)
  file.writeUInt32LE(54, 10) // pixel data offset
  file.writeUInt32LE(40, 14) // BITMAPINFOHEADER
  file.writeInt32LE(width, 18)
  file.writeInt32LE(height, 22) // positive: rows bottom-up
  file.writeUInt16LE(1, 26) // planes
  file.writeUInt16LE(24, 28) // bits per pixel
  file.writeUInt32LE(row * height, 34)
  file.writeInt32LE(2835, 38) // 72 dpi
  file.writeInt32LE(2835, 42)
  for (let yy = 0; yy < height; yy++) {
    const target = 54 + (height - 1 - yy) * row
    for (let xx = 0; xx < width; xx++) {
      const i = (yy * width + xx) * 3
      file[target + xx * 3] = raw[i + 2]
      file[target + xx * 3 + 1] = raw[i + 1]
      file[target + xx * 3 + 2] = raw[i]
    }
  }
  return file
}

rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, "frames"), { recursive: true })

const last = Math.ceil((end * 1000) / FRAME_MS)
for (let i = 0; i <= last; i++) {
  writeFileSync(join(out, "frames", `f${i}.bmp`), await bmp(sidebar((i * FRAME_MS) / 1000), SIDEBAR))
}
writeFileSync(join(out, "sidebar.bmp"), await bmp(sidebar(0), SIDEBAR))
writeFileSync(join(out, "sidebar-done.bmp"), await bmp(sidebar(end), SIDEBAR))
writeFileSync(join(out, "header.bmp"), await bmp(header, HEADER))
writeFileSync(join(out, "frames.nsh"), `; Generated by scripts/make-installer-art.mjs\n!define RP_LAST_FRAME ${last}\n!define RP_FRAME_MS ${FRAME_MS}\n`)
console.log(`Installer art: ${last + 1} frames (${FRAME_MS} ms) in build/installer`)
