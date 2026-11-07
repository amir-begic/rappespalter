// Which copies stay in backups/before-update. Separate from main.js so it can be
// tested without Electron.

const path = require("node:path")
const fs = require("node:fs")

const BEFORE_UPDATE_KEEP = 5
const STAMP_LENGTH = "2026-01-31T12-00-00-000Z.db".length

// Names are rappespalter-<version>-<time>.db. Newest first by the time: the version
// before it doesn't sort as text (1.10.0 would come before 1.9.0).
function pruneBeforeUpdateCopies(dir) {
  const madeAt = (name) => name.slice(-STAMP_LENGTH)
  const copies = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".db"))
    .sort((a, b) => madeAt(b).localeCompare(madeAt(a)))
  for (const old of copies.slice(BEFORE_UPDATE_KEEP)) {
    for (const ext of ["", "-wal", "-shm"]) fs.rmSync(path.join(dir, old + ext), { force: true })
  }
}

module.exports = { BEFORE_UPDATE_KEEP, pruneBeforeUpdateCopies }
