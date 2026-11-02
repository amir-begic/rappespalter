// Runs after `next build`. The standalone server.js does NOT include the static
// assets or the public/ folder, so we copy them into the standalone tree where
// server.js expects to serve them from. We also copy the clean template database
// that ships with the app (copied to userData on first run).
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const standalone = join(root, ".next", "standalone")

if (!existsSync(standalone)) {
  console.error("Missing .next/standalone — run `next build` first.")
  process.exit(1)
}

// .next/static -> .next/standalone/.next/static
cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), {
  recursive: true,
})

// public -> .next/standalone/public (if present)
if (existsSync(join(root, "public"))) {
  cpSync(join(root, "public"), join(standalone, "public"), { recursive: true })
}

// The seed database shipped with the app and copied to userData on first launch:
// always the committed clean template (schema + default categories). Never
// dev.db, even when present: an installer built from it would carry your own
// transactions to whoever gets the file. Bring your data in with Settings →
// Backup & restore instead.
const dist = join(root, "build", "resources")
mkdirSync(dist, { recursive: true })
const seedTemplate = join(root, "resources", "template.db")
if (!existsSync(seedTemplate)) {
  console.error("Missing resources/template.db — the app needs it as its starting database.")
  process.exit(1)
}
cpSync(seedTemplate, join(dist, "template.db"))
console.log("Used clean seed template (resources/template.db)")

// Prune unused heavyweight modules the tracer pulled in regardless. sharp /
// @img (native image-optimization libs, ~17 MB) are never loaded at runtime
// because next.config sets images.unoptimized — drop them from the bundle.
const prune = ["node_modules/@img", "node_modules/sharp", "node_modules/next/dist/docs"]
for (const rel of prune) {
  const target = join(standalone, rel)
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true })
    console.log(`Pruned ${rel}`)
  }
}

console.log("Standalone assembled at .next/standalone")
