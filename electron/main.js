// Electron main process for Rappespalter.
//
// In production it launches the Next.js standalone server (.next/standalone/server.js)
// as a child process using Electron's own bundled Node runtime, then points a
// BrowserWindow at it. In development it simply attaches to `next dev` on :3000.
//
// The SQLite database lives in the OS per-user data directory so it stays writable
// after the app is installed (the app bundle itself is read-only). On first launch
// a seeded template database is copied there.

const { app, BrowserWindow, dialog, shell } = require("electron")
const path = require("node:path")
const fs = require("node:fs")
const net = require("node:net")
const { spawn } = require("node:child_process")

const isDev = !app.isPackaged || process.env.ELECTRON_DEV === "1"
const DEV_URL = "http://localhost:3000"

let serverProcess = null
let mainWindow = null
let logFile = null
let serverOutput = "" // captured child stdout/stderr, surfaced if startup fails

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
    if (code && code !== 0 && !app.isQuitting) {
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
    backgroundColor: "#0a0a0a",
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

// --- lifecycle -----------------------------------------------------------

app.whenReady().then(async () => {
  try {
    const url = isDev ? DEV_URL : await startServer()
    createWindow(url)
  } catch (err) {
    log(`Failed to start: ${err && err.stack ? err.stack : err}`)
    dialog.showErrorBox(
      "Rappespalter failed to start",
      `${err && err.message ? err.message : err}\n\n` +
        `--- server output ---\n${serverOutput || "(none)"}\n\n` +
        `Full log: ${logFile || "(unavailable)"}`,
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
