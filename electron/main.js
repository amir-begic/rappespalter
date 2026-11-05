// Electron main process for Rappespalter.
//
// In production it launches the Next.js standalone server (.next/standalone/server.js)
// as a child process using Electron's own bundled Node runtime, then points a
// BrowserWindow at it. In development it simply attaches to `next dev` on :3000.
//
// The SQLite database lives in the OS per-user data directory so it stays writable
// after the app is installed (the app bundle itself is read-only). On first launch
// a seeded template database is copied there.
//
// Updates: electron/updater.js checks the promoted release's latest.json and downloads
// + verifies this system's package; installUpdate() below copies the database, puts
// the new version in place (Windows: silent NSIS installer; macOS: swaps the .app;
// Linux: replaces the AppImage) and restarts the app.

const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require("electron")
const crypto = require("node:crypto")
const path = require("node:path")
const fs = require("node:fs")
const net = require("node:net")
const { spawn, execFile } = require("node:child_process")
const { createUpdater } = require("./updater")

// Pin the app name so the userData directory is deterministic
// (%APPDATA%\Rappespalter on Windows) regardless of how Electron resolves the
// package name. Must run before any app.getPath("userData") call.
app.setName("Rappespalter")

// The end-to-end tests (e2e/) run the packaged app on a throwaway data folder.
// Set before the single-instance lock, which lives in that folder.
if (process.env.RAPPESPALTER_USER_DATA) app.setPath("userData", process.env.RAPPESPALTER_USER_DATA)

// One copy at a time: a second launch (e.g. a double click while the first is still
// starting) just brings the existing window forward. Two copies would each start a
// server on the same database.
const isPrimary = app.requestSingleInstanceLock()
if (!isPrimary) app.quit()

const isDev = !app.isPackaged || process.env.ELECTRON_DEV === "1"
const DEV_URL = "http://localhost:3000"
const ICON = path.join(__dirname, "..", "resources", process.platform === "win32" ? "icon.ico" : "icon.png")

// Only this process knows it: the server (src/proxy.ts) turns away requests without
// it, so other programs and web pages on this computer can't use the API.
const API_TOKEN = crypto.randomBytes(32).toString("hex")

let appUrl = null // where the window points once the server is up
let serverProcess = null
let mainWindow = null
let logFile = null
let serverOutput = "" // captured child stdout/stderr, surfaced if startup fails
let isRestarting = false // suppresses the exit→quit handler during a deliberate restart
let updater = null

// --- logging -------------------------------------------------------------

// A packaged GUI app has no console, so write diagnostics to a file in userData
// (and echo to stdout for `electron .` runs). On a fatal startup error we show
// this in a dialog so failures are never silent.
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  try {
    if (!logFile) logFile = path.join(app.getPath("userData"), "startup.log")
    fs.appendFileSync(logFile, line)
  } catch {
    /* ignore logging failures */
  }
  process.stdout.write(line)
}

// --- helpers -------------------------------------------------------------

// Ask the OS for a free TCP port so we never collide with another process.
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on("error", reject)
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

// Resolve the writable SQLite path, seeding it from the bundled template once.
function resolveDatabasePath() {
  const dbPath = path.join(app.getPath("userData"), "rappespalter.db")
  if (!fs.existsSync(dbPath)) {
    // template.db is shipped via electron-builder `extraResources`.
    const template = path.join(process.resourcesPath, "template.db")
    if (fs.existsSync(template)) {
      fs.copyFileSync(template, dbPath)
      log(`Seeded database from template at ${dbPath}`)
    } else {
      log(`No template.db found; a new empty database will be created at ${dbPath}`)
    }
  }
  return dbPath
}

// Build a libsql file URL. Use forward slashes so Windows paths
// (C:\Users\...) form a valid file: URL.
function databaseUrl(dbPath) {
  return `file:${dbPath.replace(/\\/g, "/")}`
}

// Poll until the standalone server accepts connections. Rejects early if the
// child process dies before the port comes up.
function waitForServer(port, child, timeoutMs = 30000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn, arg) => {
      if (settled) return
      settled = true
      fn(arg)
    }

    child.once("exit", (code) =>
      finish(reject, new Error(`server exited before ready (code ${code})`)),
    )

    const tryConnect = () => {
      if (settled) return
      const socket = net.connect(port, "127.0.0.1")
      socket.on("connect", () => {
        socket.end()
        finish(resolve)
      })
      socket.on("error", () => {
        socket.destroy()
        if (Date.now() - start > timeoutMs) {
          finish(reject, new Error(`server did not start within ${timeoutMs}ms`))
        } else {
          setTimeout(tryConnect, 200)
        }
      })
    }
    tryConnect()
  })
}

// The binary that runs the server as plain Node (ELECTRON_RUN_AS_NODE). On macOS
// that's the bundled "<App> Helper", a background app (LSUIElement): the main binary
// would show a second, endlessly bouncing Dock icon for the server. Every Electron app
// bundle has the Helper, so a missing one is a broken install: say so at startup.
function nodeBinary() {
  if (process.platform !== "darwin") return process.execPath
  const name = path.basename(process.execPath)
  const helper = path.join(process.execPath, "..", "..", "Frameworks", `${name} Helper.app`, "Contents", "MacOS", `${name} Helper`)
  if (!fs.existsSync(helper)) throw new Error(`${name} Helper not found at ${helper}`)
  return helper
}

async function startServer() {
  const port = await getFreePort()
  if (app.isQuitting) throw new Error("quitting") // don't leave a server behind
  const serverFile = path.join(process.resourcesPath, "standalone", "server.js")
  const dbPath = resolveDatabasePath()

  if (!fs.existsSync(serverFile)) {
    throw new Error(`Standalone server not found at ${serverFile}`)
  }

  log(`Database: ${dbPath}`)
  log(`Starting server: ${serverFile} (port ${port})`)
  serverProcess = spawn(nodeBinary(), [serverFile], {
    env: {
      ...process.env,
      // Run Electron's binary as a plain Node process for the child.
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      DATABASE_URL: databaseUrl(dbPath),
      RAPPESPALTER_TOKEN: API_TOKEN,
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  // Capture output so a crash reason is visible in the log / error dialog.
  const capture = (buf) => {
    const text = buf.toString()
    serverOutput = (serverOutput + text).slice(-4000)
    process.stdout.write(text)
    try {
      if (logFile) fs.appendFileSync(logFile, text)
    } catch {
      /* ignore */
    }
  }
  serverProcess.stdout.on("data", capture)
  serverProcess.stderr.on("data", capture)

  serverProcess.on("error", (err) => log(`Server process error: ${err.message}`))
  // A crash during startup is reported by the caller (waitForServer rejects); one
  // after that (e.g. a database migration that failed, src/instrumentation.ts) is
  // explained here, then the app quits.
  let ready = false
  serverProcess.on("exit", (code) => {
    serverProcess = null
    if (ready && code && code !== 0 && !app.isQuitting && !isRestarting) {
      log(`Server exited with code ${code}`)
      dialog.showErrorBox(
        "Rappespalter stopped",
        `The app's server stopped unexpectedly (exit code ${code}).\n\n` +
          `--- server output ---\n${serverOutput || "(none)"}\n\n` +
          `Full log: ${logFile || "(unavailable)"}` +
          afterUpdateHint(),
      )
      app.quit()
    }
  })

  await waitForServer(port, serverProcess)
  ready = true
  log("Server ready")
  appUrl = `http://127.0.0.1:${port}`
  return appUrl
}

// Adds the API token to the window's requests to its own server (pages, fetches,
// downloads), and only those. The server's port changes on a restart, so the check
// reads appUrl each time.
function authorizeRequests() {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders
    if (appUrl && !isDev && details.url.startsWith(appUrl + "/")) {
      headers["x-rappespalter-token"] = API_TOKEN
    }
    callback({ requestHeaders: headers })
  })
}

// The loading page writes the name out in about 2.8 s (the last stroke in
// loading.html starts at 2.75 s). A quick server mustn't cut it off, so the app
// replaces it only after this long, which includes a moment to read the name.
const LOADING_ANIMATION_MS = 3300
const LOADING_FADE_MS = 250
let loadingShown = null // resolves with the time the loading page was on screen

// Resolves once the loading page has played through, then fades it out. Instant
// when the system asks for reduced motion (the page doesn't animate then).
async function finishLoadingPage() {
  const contents = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null
  if (!contents || !loadingShown) return
  const shownAt = await loadingShown // the server can be ready before the page has loaded
  if (!mainWindow || mainWindow.isDestroyed()) return
  const reduced = await contents
    .executeJavaScript(`matchMedia("(prefers-reduced-motion: reduce)").matches`)
    .catch(() => false)
  if (reduced) return
  const left = shownAt + LOADING_ANIMATION_MS - Date.now()
  if (left > 0) await new Promise((resolve) => setTimeout(resolve, left))
  if (!mainWindow || mainWindow.isDestroyed()) return
  await contents.executeJavaScript(`document.body.classList.add("leaving")`).catch(() => {})
  await new Promise((resolve) => setTimeout(resolve, LOADING_FADE_MS))
}

// Opens the window at `url`, or at the loading page while the server is starting.
function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Rappespalter",
    icon: ICON,
    // The app's default (light) background and the loading page's, so there is no flash.
    backgroundColor: "#f4f1ea",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Open target=_blank / external links in the system browser, not a new window.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target)
    return { action: "deny" }
  })

  if (url) {
    mainWindow.loadURL(url)
  } else {
    const contents = mainWindow.webContents
    loadingShown = new Promise((resolve) => {
      contents.once("did-finish-load", () => resolve(Date.now()))
      contents.once("destroyed", () => resolve(Date.now()))
    })
    mainWindow.loadFile(path.join(__dirname, "loading.html"))
  }
  mainWindow.on("closed", () => {
    mainWindow = null
  })
}

// --- database import -----------------------------------------------------

// Cheap sanity check: a SQLite file begins with "SQLite format 3\0".
function isSqliteFile(p) {
  try {
    const fd = fs.openSync(p, "r")
    const buf = Buffer.alloc(16)
    fs.readSync(fd, buf, 0, 16, 0)
    fs.closeSync(fd)
    return buf.toString("latin1").startsWith("SQLite format 3")
  } catch {
    return false
  }
}

// Stop the standalone server so it releases its lock on the SQLite file.
function stopServer() {
  return new Promise((resolve) => {
    if (!serverProcess) return resolve()
    const p = serverProcess
    p.once("exit", () => resolve())
    p.kill()
    setTimeout(resolve, 3000) // safety: don't hang if exit never fires
  })
}

// A password-protected backup (src/lib/backup-crypto.ts) starts with this.
function isEncryptedBackup(file) {
  try {
    const fd = fs.openSync(file, "r")
    const head = Buffer.alloc(8)
    fs.readSync(fd, head, 0, 8, 0)
    fs.closeSync(fd)
    return head.toString("ascii") === "RPBACKUP"
  } catch {
    return false
  }
}

// Before File → Import Database replaces the data: a copy in backups/before-restore,
// the folder Settings → Backup & restore lists (src/lib/backup-copies.ts). The
// server is stopped, so the file and its WAL are consistent.
function keepCopyBeforeImport(dbPath) {
  if (!fs.existsSync(dbPath)) return
  const dir = path.join(path.dirname(dbPath), "backups", "before-restore")
  fs.mkdirSync(dir, { recursive: true })
  const target = path.join(dir, `rappespalter-${new Date().toISOString().replace(/[:.]/g, "-")}.db`)
  fs.copyFileSync(dbPath, target)
  for (const ext of ["-wal", "-shm"]) {
    if (fs.existsSync(dbPath + ext)) fs.copyFileSync(dbPath + ext, target + ext)
  }
  log(`Database copied to ${target}`)
}

// Replace the live database with the chosen file and restart the server.
async function importDatabase(sourcePath) {
  const dbPath = path.join(app.getPath("userData"), "rappespalter.db")
  isRestarting = true
  try {
    await stopServer()
    keepCopyBeforeImport(dbPath)
    fs.copyFileSync(sourcePath, dbPath)
    for (const ext of ["-wal", "-shm", "-journal"]) {
      fs.rmSync(dbPath + ext, { force: true })
    }
    log(`Imported database from ${sourcePath}`)
    const url = await startServer()
    if (mainWindow) mainWindow.loadURL(url)
  } finally {
    isRestarting = false
  }
}

// Menu handler: pick a .db file, confirm, then import it.
async function promptImportDatabase() {
  if (isDev) {
    dialog.showMessageBox(mainWindow, {
      type: "info",
      message: "Available in the installed app",
      detail:
        "Database import manages the packaged app's database. In dev mode the " +
        "app uses the project's dev.db via your .env instead.",
    })
    return
  }

  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: "Import Rappespalter database",
    properties: ["openFile"],
    filters: [{ name: "SQLite database", extensions: ["db", "sqlite", "sqlite3"] }],
  })
  if (canceled || !filePaths || !filePaths.length) return
  const source = filePaths[0]

  if (!isSqliteFile(source)) {
    dialog.showErrorBox(
      "Not a database file",
      isEncryptedBackup(source)
        ? `${source}\n\nThis is a password-protected backup. Restore it on Settings → Backup & restore, which asks for its password.`
        : `${source}\n\nThis doesn't look like a SQLite database.`,
    )
    return
  }

  const choice = dialog.showMessageBoxSync(mainWindow, {
    type: "warning",
    buttons: ["Cancel", "Replace"],
    defaultId: 1,
    cancelId: 0,
    message: "Replace the current database?",
    detail:
      `This overwrites the app's current data with:\n${source}\n\n` +
      "A copy of the current data is kept in backups/before-restore (File → Open Data Folder). The app will reload.",
  })
  if (choice !== 1) return

  try {
    await importDatabase(source)
    dialog.showMessageBox(mainWindow, {
      type: "info",
      message: "Database imported",
      detail: "The app has reloaded with the imported database.",
    })
  } catch (err) {
    log(`Import failed: ${err && err.stack ? err.stack : err}`)
    dialog.showErrorBox("Import failed", String((err && err.message) || err))
  }
}

// --- updates -------------------------------------------------------------

const BEFORE_UPDATE_KEEP = 5

// Copy the database (and its WAL, if any) to backups/before-update, keeping the
// newest few. The server must be stopped so the copy is consistent.
function backupDatabase(fromVersion) {
  const dbPath = path.join(app.getPath("userData"), "rappespalter.db")
  if (!fs.existsSync(dbPath)) return null
  const dir = path.join(app.getPath("userData"), "backups", "before-update")
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const target = path.join(dir, `rappespalter-${fromVersion}-${stamp}.db`)
  fs.copyFileSync(dbPath, target)
  for (const ext of ["-wal", "-shm"]) {
    if (fs.existsSync(dbPath + ext)) fs.copyFileSync(dbPath + ext, target + ext)
  }

  const copies = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".db"))
    .sort()
    .reverse()
  for (const old of copies.slice(BEFORE_UPDATE_KEEP)) {
    for (const ext of ["", "-wal", "-shm"]) fs.rmSync(path.join(dir, old + ext), { force: true })
  }
  log(`Database copied to ${target}`)
  return target
}

let updating = false

async function installUpdate() {
  const release = updater && updater.available()
  if (!release || updating) return
  updating = true
  try {
    await runUpdate(release)
  } finally {
    updating = false
  }
}

// Start a detached program that outlives us, once it has actually started.
async function spawnDetached(command, args, options = {}) {
  const child = spawn(command, args, { detached: true, stdio: "ignore", ...options })
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve)
    child.once("error", reject)
  })
  child.unref()
}

// Windows: the NSIS installer, silent (/S), as an update (--updated keeps the
// shortcuts as they are), and it starts the app when done (--force-run).
async function installWindows(installer) {
  await spawnDetached(installer, ["--updated", "/S", "--force-run"])
}

// The .app this copy runs from (…/Rappespalter.app/Contents/MacOS/Rappespalter).
function macBundle() {
  const bundle = path.resolve(process.execPath, "..", "..", "..")
  return bundle.endsWith(".app") ? bundle : null
}

// Where a macOS update is unpacked: next to the .app, so swapping them is a rename
// on the same volume. Removed on the next start.
function macStaging(bundle) {
  return path.join(path.dirname(bundle), ".Rappespalter-update")
}

// macOS: unpack the zipped .app next to the running one, then hand the swap to a
// shell that waits for us to exit (a running bundle's files shouldn't change under
// it), moves the new .app in, and opens it. If the move fails it puts the old one
// back and opens that, and the next start reports the update as failed. Unpacking
// here fails early, with the app still running, when the folder isn't writable
// (e.g. run straight from the disk image).
async function installMac(zip) {
  const bundle = macBundle()
  if (!bundle) throw new Error("Can't tell where Rappespalter is installed.")
  const staging = macStaging(bundle)
  fs.rmSync(staging, { recursive: true, force: true })
  try {
    await new Promise((resolve, reject) =>
      execFile("/usr/bin/ditto", ["-x", "-k", zip, staging], (err) => (err ? reject(err) : resolve())),
    )
  } catch (err) {
    fs.rmSync(staging, { recursive: true, force: true })
    throw new Error(
      `Couldn't unpack the update next to ${bundle}. Move Rappespalter to your Applications folder and try again.`,
      { cause: err },
    )
  }
  const unpacked = path.join(staging, "Rappespalter.app")
  if (!fs.existsSync(path.join(unpacked, "Contents", "MacOS"))) {
    fs.rmSync(staging, { recursive: true, force: true })
    throw new Error("The update doesn't contain Rappespalter.app.")
  }
  const script = `
    while kill -0 "$1" 2>/dev/null; do sleep 0.2; done
    if mv "$2" "$3/previous.app"; then
      mv "$4" "$2" || mv "$3/previous.app" "$2"
    fi
    open "$2"
  `
  await spawnDetached("/bin/sh", ["-c", script, "sh", String(process.pid), bundle, staging, unpacked])
}

// Linux: put the new AppImage beside the running one, then rename it over it (the
// running copy keeps its file open, so that's safe) and start it once we've exited.
// The AppImage runtime's own variables are left out so the new copy sets its own.
async function installLinux(appImage) {
  const target = process.env.APPIMAGE
  if (!target) throw new Error("Can't tell where the AppImage is.")
  const next = target + ".update"
  try {
    fs.copyFileSync(appImage, next)
    fs.chmodSync(next, 0o755)
    fs.renameSync(next, target)
  } catch (err) {
    fs.rmSync(next, { force: true })
    throw new Error(`Couldn't replace ${target}. Is its folder writable?`, { cause: err })
  }
  const env = { ...process.env }
  for (const name of ["APPIMAGE", "APPDIR", "ARGV0", "OWD"]) delete env[name]
  const script = `
    while kill -0 "$1" 2>/dev/null; do sleep 0.2; done
    exec "$2"
  `
  await spawnDetached("/bin/sh", ["-c", script, "sh", String(process.pid), target], { env, cwd: path.dirname(target) })
}

const INSTALLERS = { win32: installWindows, darwin: installMac, linux: installLinux }

// Confirm, download the release, copy the database and put the new version in place
// (INSTALLERS); each starts the new version once we've quit, which we do right after.
async function runUpdate(release) {
  const choice = await dialog.showMessageBox(mainWindow, {
    type: "question",
    buttons: ["Cancel", "Install"],
    defaultId: 1,
    cancelId: 0,
    message: `Install Rappespalter ${release.version}?`,
    detail:
      "Rappespalter downloads the new version, closes, saves a copy of your database " +
      "and starts again once it's installed. Takes about a minute.",
  })
  if (choice.response !== 1) return

  let installer
  try {
    ;({ installer } = await updater.downloadAvailable())
  } catch (err) {
    log(`Update download failed: ${err && err.stack ? err.stack : err}`)
    updater.setError(String((err && err.message) || err))
    return
  }

  updater.setInstalling(true)
  isRestarting = true
  try {
    await stopServer()
    const backup = backupDatabase(updater.current)
    updater.writeStatus({ state: "installing", from: updater.current, version: release.version, backup })
    await INSTALLERS[process.platform](installer)
    log(`Installing ${release.version}`)
    app.quit()
  } catch (err) {
    log(`Update failed: ${err && err.stack ? err.stack : err}`)
    updater.writeStatus({
      state: "failed",
      from: updater.current,
      version: release.version,
      message: String((err && err.message) || err),
    })
    updater.setInstalling(false)
    // Bring the current version back up.
    try {
      const url = await startServer()
      if (mainWindow) mainWindow.loadURL(url + "/settings#updates")
    } catch (restartErr) {
      log(`Restart after failed update failed: ${restartErr}`)
      dialog.showErrorBox("Rappespalter failed to restart", String(restartErr))
      app.quit()
    }
  } finally {
    isRestarting = false
  }
}

// The renderer (via preload.js) may only talk to the main window.
function fromMainWindow(event) {
  return mainWindow && event.sender === mainWindow.webContents
}

function registerUpdateIpc() {
  ipcMain.handle("updates:state", (event) => (fromMainWindow(event) ? updater.state() : null))
  ipcMain.handle("updates:check", (event) => (fromMainWindow(event) ? updater.check() : null))
  ipcMain.handle("updates:install", async (event) => {
    if (fromMainWindow(event)) await installUpdate()
    return updater.state()
  })
  updater.onChange((state) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("updates:changed", state)
  })
}

// If the app fails to start right after an update, say where the old database is.
function afterUpdateHint() {
  const status = updater && updater.recentStatus()
  if (!status || status.state !== "succeeded" || status.version !== updater.current) return ""
  return (
    `\n\nThis is the first start after updating from ${status.from} to ${status.version}. ` +
    (status.backup ? `Your database from before the update is at:\n${status.backup}\n` : "") +
    "Reinstall the previous version from the GitHub releases page, then use " +
    "File → Import Database… to load that copy if needed."
  )
}

function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        { label: "Import Database…", click: () => promptImportDatabase() },
        {
          label: "Open Data Folder",
          click: () => shell.openPath(app.getPath("userData")),
        },
        { type: "separator" },
        { role: process.platform === "darwin" ? "close" : "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// --- lifecycle -----------------------------------------------------------

// Start the server right away rather than after `ready`: it's most of the startup
// time, and neither it nor the userData paths need the app to be ready.
const serverStarting = isPrimary && !isDev ? startServer() : Promise.resolve(DEV_URL)
serverStarting.catch(() => {}) // handled below; avoids an unhandled rejection before `ready`

app.on("second-instance", () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

app.whenReady().then(async () => {
  if (!isPrimary) return
  buildMenu()
  updater = createUpdater({ log })
  updater.start()
  // What's left of a macOS update: the unpacked folder and the previous .app.
  if (process.platform === "darwin" && app.isPackaged && macBundle()) {
    fs.rm(macStaging(macBundle()), { recursive: true, force: true }, () => {})
  }
  registerUpdateIpc()
  authorizeRequests()
  createWindow()
  try {
    appUrl = await serverStarting
    await finishLoadingPage()
    if (mainWindow) mainWindow.loadURL(appUrl)
  } catch (err) {
    if (app.isQuitting) return // window closed while starting; the server was stopped
    log(`Failed to start: ${err && err.stack ? err.stack : err}`)
    dialog.showErrorBox(
      "Rappespalter failed to start",
      `${err && err.message ? err.message : err}\n\n` +
        `--- server output ---\n${serverOutput || "(none)"}\n\n` +
        `Full log: ${logFile || "(unavailable)"}` +
        afterUpdateHint(),
    )
    app.quit()
  }

  // macOS keeps running with no windows; reopen at the server that's still up.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && appUrl) createWindow(appUrl)
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

app.on("before-quit", () => {
  app.isQuitting = true
  if (serverProcess) serverProcess.kill()
})
