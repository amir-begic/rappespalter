// Render the app icon (src/app/icon.svg, also the favicon) into the files the
// desktop app needs, written to resources/ and committed:
//   icon.png  512×512 — Linux/macOS app icon and the window icon
//   icon.ico  16–256 px — Windows exe, taskbar and installer icon
// Run after changing icon.svg: `node scripts/make-icons.mjs`
// (sharp comes with Next; it isn't needed at build time.)
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const svg = readFileSync(join(root, "src", "app", "icon.svg"))
const out = join(root, "resources")

// The SVG is 32 units wide; render at a high density so large sizes stay sharp.
const render = (size) =>
  sharp(svg, { density: Math.ceil((72 * size) / 32) * 2 })
    .resize(size, size)
    .png()
    .toBuffer()

writeFileSync(join(out, "icon.png"), await render(512))

// ICO with PNG-compressed entries (supported since Windows Vista).
const sizes = [16, 24, 32, 48, 64, 128, 256]
const images = await Promise.all(sizes.map(render))
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(sizes.length, 4)
let offset = 6 + 16 * sizes.length
const entries = sizes.map((size, i) => {
  const e = Buffer.alloc(16)
  e.writeUInt8(size >= 256 ? 0 : size, 0) // width (0 = 256)
  e.writeUInt8(size >= 256 ? 0 : size, 1) // height
  e.writeUInt8(0, 2) // palette colours
  e.writeUInt8(0, 3) // reserved
  e.writeUInt16LE(1, 4) // colour planes
  e.writeUInt16LE(32, 6) // bits per pixel
  e.writeUInt32LE(images[i].length, 8)
  e.writeUInt32LE(offset, 12)
  offset += images[i].length
  return e
})
writeFileSync(join(out, "icon.ico"), Buffer.concat([header, ...entries, ...images]))

console.log(`Wrote resources/icon.png and resources/icon.ico (${sizes.join(", ")} px)`)
