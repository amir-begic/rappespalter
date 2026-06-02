// electron-builder afterPack hook: Electron bundles ~50 Chromium locale .pak
// files (one per language). We only ship English, so delete the rest to shave
// a few MB off the packaged app. Runs after the app is staged, before packaging.
const { readdirSync, rmSync, existsSync } = require("node:fs")
const { join } = require("node:path")

exports.default = async function afterPack(context) {
  // macOS stores locales inside the .app framework with a different layout; skip.
  if (context.electronPlatformName === "darwin") return

  const keep = new Set(["en-US.pak"])
  const localesDir = join(context.appOutDir, "locales")
  if (!existsSync(localesDir)) return

  let removed = 0
  for (const file of readdirSync(localesDir)) {
    if (file.endsWith(".pak") && !keep.has(file)) {
      rmSync(join(localesDir, file))
      removed++
    }
  }
  console.log(`afterPack: removed ${removed} unused locale .pak files`)
}
