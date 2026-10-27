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
// Updates (Windows): electron/updater.js checks the promoted release's latest.json and
// downloads + verifies the installer; installUpdate() below copies the database and
// runs the installer silently, which restarts the app.

const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell } = require("electron")
const path = require("node:path")
const fs = require("node:fs")
const net = require("node:net")
const { spawn } = require("node:child_process")
const { createUpdater } = require("./updater")

// Pin the app name so the userData directory is deterministic
// (%APPDATA%\Rappespalter on Windows) regardless of how Electron resolves the
// package name. Must run before any app.getPath("userData") call.
app.setName("Rappespalter")

const isDev = !app.isPackaged || process.env.ELECTRON_DEV === "1"
const DEV_URL = "http://localhost:3000"

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

async function startServer() {
  const port = await getFreePort()
  const serverFile = path.join(process.resourcesPath, "standalone", "server.js")
  const dbPath = resolveDatabasePath()

  if (!fs.existsSync(serverFile)) {
    throw new Error(`Standalone server not found at ${serverFile}`)
  }

  log(`Database: ${dbPath}`)
  log(`Starting server: ${serverFile} (port ${port})`)
  serverProcess = spawn(process.execPath, [serverFile], {
    env: {
      ...process.env,
      // Run Electron's binary as a plain Node process for the child.
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      DATABASE_URL: databaseUrl(dbPath),
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
  serverProcess.on("exit", (code) => {
    serverProcess = null
    if (code && code !== 0 && !app.isQuitting && !isRestarting) {
      log(`Server exited with code ${code}`)
      app.quit()
    }
  })

  await waitForServer(port, serverProcess)
  log("Server ready")
  return `http://127.0.0.1:${port}`
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Rappespalter",
    // Match the page background (globals.css) so there is no flash on load.
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#121419" : "#f9fafb",
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

  mainWindow.loadURL(url)
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

// Replace the live database with the chosen file and restart the server.
async function importDatabase(sourcePath) {
  const dbPath = path.join(app.getPath("userData"), "rappespalter.db")
  isRestarting = true
  try {
    await stopServer()
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
      `${source}\n\nThis doesn't look like a SQLite database.`,
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
      "The app will reload. This cannot be undone.",
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

// Confirm, download the release, copy the database and hand over to the NSIS
// installer: silent (/S), as an update (--updated keeps the shortcuts as they are),
// and start the app when done (--force-run). We quit right after.
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
    const child = spawn(installer, ["--updated", "/S", "--force-run"], { detached: true, stdio: "ignore" })
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve)
      child.once("error", reject)
    })
    child.unref()
    log(`Started installer for ${release.version}`)
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

app.whenReady().then(async () => {
  buildMenu()
  updater = createUpdater({ log })
  updater.start()
  registerUpdateIpc()
  try {
    const url = isDev ? DEV_URL : await startServer()
    createWindow(url)
  } catch (err) {
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

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && !isDev) {
      startServer().then(createWindow).catch((err) => log(String(err)))
    }
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

app.on("before-quit", () => {
  app.isQuitting = true
  if (serverProcess) serverProcess.kill()
})
