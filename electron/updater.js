// Updates for the installed Windows app.
//
// .github/workflows/release.yml builds every pushed vX.Y.Z tag as a pre-release with
// latest.json next to the installer: the version, the release notes and, per system,
// the installer's download address, size and SHA-256. promote.yml makes one release
// the repository's latest, and only that one is read here:
// …/releases/latest/download/latest.json. So installed copies only ever get versions
// that were promoted by hand, never a fresh tag.
//
// This module checks the feed and downloads + verifies the installer. main.js does
// the rest (stop the server, copy the database, run the installer, quit), because it
// owns the server process and the database path.

const { app, net } = require("electron")
const path = require("node:path")
const fs = require("node:fs")
const crypto = require("node:crypto")

const FEED_URL =
  process.env.RAPPESPALTER_UPDATE_FEED ||
  "https://github.com/amir-begic/rappespalter/releases/latest/download/latest.json"

// The feed's key for this system's package. Only Windows is built (see release.yml).
const PLATFORM = process.platform === "win32" && process.arch === "x64" ? "win-x64" : null

const FIRST_CHECK_DELAY_MS = 60 * 1000
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const RECENT_STATUS_MS = 7 * 24 * 60 * 60 * 1000

const INSTALLER_NAME = /^Rappespalter-Setup(-[0-9A-Za-z.-]+)?\.exe$/
const SHA256 = /^[0-9a-f]{64}$/i

// --- versions ----------------------------------------------------------------

// "v0.1.5" → [0, 1, 5]. Anything after the numbers (e.g. "-rc.1") is ignored.
function parseVersion(text) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(text || "").trim())
  return m ? m.slice(1, 4).map(Number) : null
}

function isNewer(candidate, current) {
  const a = parseVersion(candidate)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return false
}

// --- feed --------------------------------------------------------------------

// The release for this system from a latest.json, or null unless it names an
// installer for it with an https address and its SHA-256.
function toRelease(json, platform) {
  const pkg = json && json.packages && json.packages[platform]
  if (!json || !parseVersion(json.version) || !pkg) return null
  if (typeof pkg.file !== "string" || !INSTALLER_NAME.test(pkg.file)) return null
  if (typeof pkg.sha256 !== "string" || !SHA256.test(pkg.sha256)) return null
  let download
  try {
    download = new URL(pkg.download)
  } catch {
    return null
  }
  if (download.protocol !== "https:") return null

  return {
    version: String(json.version).replace(/^v/, ""),
    published: json.published || null,
    notes: typeof json.notes === "string" ? json.notes.trim() : "",
    page: typeof json.page === "string" && json.page.startsWith("https://") ? json.page : null,
    file: pkg.file,
    size: Number(pkg.size) || 0,
    sha256: pkg.sha256.toLowerCase(),
    download: download.href,
  }
}

function createUpdater({ log }) {
  const current = app.getVersion()
  const configured = app.isPackaged && PLATFORM !== null && process.env.ELECTRON_DEV !== "1"
  const updatesDir = path.join(app.getPath("userData"), "updates")
  const statusFile = path.join(updatesDir, "status.json")

  let lastCheck = null
  let latest = null
  let unreachable = false
  let checking = false
  let download = null // { received, total } while the installer downloads
  let installing = false
  let error = null
  let timer = null
  const listeners = new Set()

  const available = () => (latest && isNewer(latest.version, current) ? latest : null)

  // --- status of the last update (written by main.js before it runs the installer)

  function readStatus() {
    try {
      return JSON.parse(fs.readFileSync(statusFile, "utf8"))
    } catch {
      return null
    }
  }

  function writeStatus(status) {
    fs.mkdirSync(updatesDir, { recursive: true })
    const tmp = statusFile + ".tmp"
    fs.writeFileSync(tmp, JSON.stringify({ ...status, time: new Date().toISOString() }, null, 2))
    fs.renameSync(tmp, statusFile)
  }

  // On start: an update that was "installing" either worked (we now run its
  // version) or the installer didn't finish. Leftover installers are removed.
  function settleStatus() {
    const status = readStatus()
    if (status && status.state === "installing") {
      if (status.version === current) {
        writeStatus({ ...status, state: "succeeded" })
        log(`Updated from ${status.from} to ${current}`)
      } else {
        writeStatus({
          ...status,
          state: "failed",
          message: `The installer didn't finish; Rappespalter is still ${current}.`,
        })
        log(`Update to ${status.version} didn't install; still ${current}`)
      }
    }
    try {
      for (const f of fs.readdirSync(updatesDir)) {
        if (f.endsWith(".exe") || f.endsWith(".part")) fs.rmSync(path.join(updatesDir, f), { force: true })
      }
    } catch {
      /* no updates folder yet */
    }
  }

  // The status, if it's from the last week (older news isn't worth showing).
  function recentStatus() {
    const status = readStatus()
    if (!status || !status.time || Date.now() - Date.parse(status.time) > RECENT_STATUS_MS) return null
    return status
  }

  // --- state for the renderer ---------------------------------------------------

  function state() {
    const release = available()
    return {
      configured,
      current,
      lastCheck,
      checking,
      unreachable,
      upToDate: Boolean(latest) && !release,
      available: release && {
        version: release.version,
        notes: release.notes,
        page: release.page,
        published: release.published,
        size: release.size,
      },
      download,
      installing,
      error,
      status: recentStatus(),
    }
  }

  function changed() {
    const s = state()
    for (const fn of listeners) fn(s)
  }

  function onChange(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  // --- checking -----------------------------------------------------------------

  async function check() {
    if (!configured || checking) return state()
    checking = true
    error = null
    changed()
    try {
      const res = await net.fetch(FEED_URL, { cache: "no-store", headers: { "Cache-Control": "no-cache" } })
      if (res.status === 404) {
        latest = null // nothing promoted yet
      } else if (!res.ok) {
        throw new Error(`update feed answered ${res.status}`)
      } else {
        latest = toRelease(await res.json(), PLATFORM)
      }
      unreachable = false
    } catch (err) {
      unreachable = true
      log(`Update check failed: ${err && err.message ? err.message : err}`)
    } finally {
      lastCheck = new Date().toISOString()
      checking = false
      changed()
    }
    return state()
  }

  // A minute after start, then every six hours.
  function start() {
    settleStatus()
    if (!configured) return
    const first = setTimeout(() => {
      check()
      timer = setInterval(check, CHECK_INTERVAL_MS)
      timer.unref()
    }, FIRST_CHECK_DELAY_MS)
    first.unref()
  }

  // --- downloading --------------------------------------------------------------

  // Downloads the available release's installer into userData/updates and checks
  // its size and SHA-256. Returns the release and the installer's path.
  async function downloadAvailable() {
    const release = available()
    if (!release) throw new Error("There's no newer version to install.")

    fs.mkdirSync(updatesDir, { recursive: true })
    const target = path.join(updatesDir, release.file)
    const partial = target + ".part"
    download = { received: 0, total: release.size }
    error = null
    changed()

    try {
      const res = await net.fetch(release.download)
      if (!res.ok || !res.body) throw new Error(`download answered ${res.status}`)

      const hash = crypto.createHash("sha256")
      const out = fs.createWriteStream(partial)
      let lastReport = 0
      try {
        for await (const chunk of res.body) {
          hash.update(chunk)
          if (!out.write(chunk)) await new Promise((resolve) => out.once("drain", resolve))
          download.received += chunk.length
          if (Date.now() - lastReport > 250) {
            lastReport = Date.now()
            changed()
          }
        }
      } finally {
        await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())))
      }

      if (release.size && download.received !== release.size) {
        throw new Error("The download is incomplete. Try again.")
      }
      if (hash.digest("hex") !== release.sha256) {
        throw new Error("The download doesn't match the release. Try again.")
      }
      fs.renameSync(partial, target)
      log(`Downloaded and verified ${release.file} (${release.version})`)
      return { release, installer: target }
    } catch (err) {
      fs.rmSync(partial, { force: true })
      throw err
    } finally {
      download = null
      changed()
    }
  }

  function setInstalling(value) {
    installing = value
    changed()
  }

  function setError(message) {
    error = message
    changed()
  }

  return {
    configured,
    current,
    start,
    check,
    state,
    onChange,
    available,
    downloadAvailable,
    setInstalling,
    setError,
    writeStatus,
    recentStatus,
  }
}

module.exports = { createUpdater, isNewer, parseVersion, toRelease }
