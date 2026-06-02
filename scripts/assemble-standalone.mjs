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

// Snapshot dev.db as the seed template shipped with the app.
const dist = join(root, "build", "resources")
mkdirSync(dist, { recursive: true })
const devDb = join(root, "dev.db")
if (existsSync(devDb)) {
  cpSync(devDb, join(dist, "template.db"))
  console.log("Seeded template.db from dev.db")
} else {
  console.warn("dev.db not found — packaged app will start with an empty database.")
}

console.log("Standalone assembled at .next/standalone")
