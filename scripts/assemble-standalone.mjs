// Runs after `next build`. The standalone server.js does NOT include the static
// assets or the public/ folder, so we copy them into the standalone tree where
// server.js expects to serve them from. We also snapshot the current dev.db as
// the template database that ships with the app (copied to userData on first run).
import { cpSync, existsSync, mkdirSync } from "node:fs"
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

// Produce the seed template shipped with the app and copied to userData on
// first launch. A personal build (dev.db present) ships your own data; any other
// build (e.g. CI, where dev.db is gitignored) ships the committed clean template
// — schema + default categories, no personal data — so the app has a working,
// queryable database out of the box.
const dist = join(root, "build", "resources")
mkdirSync(dist, { recursive: true })
const devDb = join(root, "dev.db")
const seedTemplate = join(root, "resources", "template.db")
if (existsSync(devDb)) {
  cpSync(devDb, join(dist, "template.db"))
  console.log("Seeded template.db from dev.db (personal build)")
} else if (existsSync(seedTemplate)) {
  cpSync(seedTemplate, join(dist, "template.db"))
  console.log("Used clean seed template (resources/template.db)")
} else {
  console.warn("No dev.db or resources/template.db — packaged app will start with an empty database.")
}

console.log("Standalone assembled at .next/standalone")
