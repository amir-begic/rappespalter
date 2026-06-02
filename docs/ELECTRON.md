# Running Rappespalter as a desktop app (Electron)

Rappespalter can be packaged as a standalone desktop application. Because the app
has real server-side API routes (Prisma + SQLite), the desktop build does **not**
use a static export — instead it runs the Next.js production server inside Electron
and points a window at it.

## How it works

```
┌─ Electron main process (electron/main.js) ────────────────┐
│                                                            │
│  1. picks a free localhost port                            │
│  2. resolves a writable DB path in userData                │
│     (copies the bundled template.db there on first launch) │
│  3. spawns .next/standalone/server.js using Electron's own │
│     bundled Node (ELECTRON_RUN_AS_NODE=1), passing PORT +  │
│     DATABASE_URL via env                                   │
│  4. waits for the port to accept connections               │
│  5. opens a BrowserWindow at http://127.0.0.1:<port>       │
└────────────────────────────────────────────────────────────┘
```

No separate Node.js install is required on the target machine — Electron's own
runtime executes the server.

### Why the build is wired the way it is

- **`output: "standalone"`** ([next.config.ts](../next.config.ts)) emits a
  self-contained server bundle at `.next/standalone` with only the traced
  `node_modules` it needs.
- **`outputFileTracingIncludes`** force-includes two things the file tracer would
  otherwise miss: the Prisma client generated outside `src/` (`generated/prisma`)
  and `@prisma/adapter-libsql`. (`@libsql/client` is picked up automatically.)
- **`scripts/assemble-standalone.mjs`** runs after `next build` to copy
  `.next/static` and `public/` into the standalone tree (server.js does not copy
  them itself) and to snapshot the current `dev.db` as `build/resources/template.db`.
- **electron-builder** (`build` block in [package.json](../package.json)) ships
  `electron/` in the app bundle and the standalone server + template DB as
  `extraResources`.

### Database location

In the packaged app the SQLite file lives in the per-user data directory so it
stays writable (the installed app bundle is read-only):

| OS      | Path                                                          |
| ------- | ------------------------------------------------------------- |
| Linux   | `~/.config/Rappespalter/rappespalter.db`                      |
| Windows | `%APPDATA%\Rappespalter\rappespalter.db`                      |
| macOS   | `~/Library/Application Support/Rappespalter/rappespalter.db`  |

On first launch this is seeded from `template.db` (a personal build snapshots your
`dev.db`; other builds ship a clean schema + default categories). Delete the file
to reset to the shipped template.

### Importing a database from the app

Use **File → Import Database…** to load an existing `.db` (e.g. your `dev.db`)
without touching the filesystem. It validates the file is SQLite, stops the
server to release the lock, copies it over `rappespalter.db` (clearing any stale
`-wal`/`-shm`/`-journal`), restarts, and reloads the window. **File → Open Data
Folder** opens the directory above.

## Commands

```bash
# Develop: run the normal dev server in one terminal …
pnpm dev
# … and the Electron shell in another (attaches to localhost:3000)
pnpm electron:dev

# Build the standalone server + assemble static assets + snapshot the DB
pnpm build:desktop

# Produce a distributable installer (runs build:desktop first)
pnpm dist
```

`pnpm dist` writes installers to `dist/` (AppImage on Linux, NSIS `.exe` on
Windows, `.dmg` on macOS — see the `build` block in package.json to adjust
targets).

## Updating the shipped database template

The template is just a copy of `dev.db` taken during `pnpm build:desktop`. To ship
a different starting state (e.g. empty, or freshly seeded):

```bash
pnpm dlx prisma migrate reset   # wipe + reapply migrations + seed categories
pnpm build:desktop              # snapshots the new dev.db as template.db
```

> The desktop build does **not** run Prisma migrations at runtime. The shipped
> `template.db` already contains the schema. After a schema change, rebuild so a
> fresh `template.db` with the new schema is bundled. (Existing users' databases
> in userData are not migrated automatically — for a personal single-user app this
> is usually fine; if you need it, add a migration step to `main.js`.)

## Building the Windows app

> **Build on Windows, not in WSL2.** The SQLite layer (`@libsql/client` → `libsql`)
> uses native, per-platform `.node` binaries. A WSL2 checkout only has the Linux
> ones, and `next build` bundles whichever platform it runs on — so a build made in
> WSL2 will crash on Windows. Run the build on the Windows machine, where
> `pnpm install` fetches the `@libsql/win32-x64-msvc` prebuild and the Windows
> Electron binary automatically (no Wine required).

On the **Windows machine** (PowerShell):

```powershell
# 1. Install Node 22 LTS (https://nodejs.org), then pnpm:
npm install -g pnpm

# 2. Get the code onto Windows. Either git clone your remote, or copy from WSL
#    (replace "Ubuntu" with your distro name — check with `wsl -l` ):
robocopy \\wsl$\Ubuntu\home\amir\dev\rappespalter C:\dev\rappespalter /E /XD node_modules .next dist build .git

cd C:\dev\rappespalter

# 3. (optional) bring your current data so the app ships with it.
#    dev.db is gitignored, so copy it explicitly if you cloned via git:
copy \\wsl$\Ubuntu\home\amir\dev\rappespalter\dev.db .

# 4. install dependencies (pulls the Windows libsql + Electron binaries)
pnpm install

# 5a. build an installer  ->  dist\Rappespalter Setup 0.1.0.exe
pnpm dist

# 5b. OR build an unpacked, no-install folder you can zip and copy anywhere
#     ->  dist\win-unpacked\Rappespalter.exe
pnpm build:desktop
pnpm exec electron-builder --win --dir
```

Then either run the installer, or zip `dist\win-unpacked\` and copy it to any
Windows PC and run `Rappespalter.exe` directly — no install needed.

> The `electron:dev` script uses Unix env-var syntax and won't work in PowerShell
> as-is; for dev on Windows use `set ELECTRON_DEV=1 && electron .` (cmd) or
> `$env:ELECTRON_DEV=1; electron .` (PowerShell). `pnpm dist` / `pnpm build:desktop`
> are cross-platform and work unchanged.

### No Windows toolchain? Use CI instead

If you'd rather not install Node on Windows, build the `.exe` on a GitHub Actions
`windows-latest` runner (`pnpm install && pnpm dist`) and download the artifact.
Same result, fully reproducible.

## WSL2 / Linux notes

Electron is a GUI app and needs system libraries + a display:

- On **Windows 11 with WSLg**, GUI apps work out of the box.
- If `electron` fails with `error while loading shared libraries: libasound.so.2`
  (or similar), install the runtime libs:

  ```bash
  sudo apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libgtk-3-0 libgbm1 libasound2
  ```

- Building Linux installers (`pnpm dist`) works headlessly; only **running** the
  GUI needs a display.

## Why the flat node_modules (`.npmrc`)

[`.npmrc`](../.npmrc) sets `node-linker=hoisted`. The standalone bundle is copied
to other machines, and pnpm's default symlinked layout keeps transitive runtime
deps (notably `@swc/helpers`, loaded by Next via its require-hook) only under
`.pnpm/` behind symlinks that break when copied cross-platform — producing
`Cannot find module '@swc/helpers/_/_interop_require_default'` and an instant exit
on Windows. A hoisted layout places real files at the top level so the bundle is
self-contained and portable. `@swc/helpers` is also force-listed in
`outputFileTracingIncludes` because the tracer can't follow Next's runtime require.

## Troubleshooting

- **App opens and immediately exits** — the standalone server crashed on startup.
  The main process writes a log and shows the error in a dialog. Find the log at:
  - Windows: `%APPDATA%\Rappespalter\startup.log`
  - Linux: `~/.config/Rappespalter/startup.log`
  - macOS: `~/Library/Application Support/Rappespalter/startup.log`
- **`Cannot find module '@swc/helpers/...'` (or another transitive dep)** — the
  bundle is missing a runtime dependency. Ensure `node-linker=hoisted` is in
  `.npmrc`, add the package to `outputFileTracingIncludes` in
  [next.config.ts](../next.config.ts), and rebuild.
- **Inspect the bundled server directly** (what the GUI hides). On Windows:

  ```powershell
  cd "$env:LOCALAPPDATA\Programs\rappespalter\resources\standalone"
  $env:ELECTRON_RUN_AS_NODE="1"; $env:PORT="3000"; $env:DATABASE_URL="file:./diag.db"
  & "..\..\Rappespalter.exe" "server.js"
  ```

- **Verify the server bundle on the build machine:**

  ```bash
  cp dev.db /tmp/test.db
  PORT=3987 DATABASE_URL="file:/tmp/test.db" node .next/standalone/server.js
  curl http://127.0.0.1:3987/api/months
  ```
