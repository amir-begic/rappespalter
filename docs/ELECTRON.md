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

### Who can talk to the server

Listening on `127.0.0.1` keeps other computers out, but not other programs or web
pages on this one: a page open in the browser could post a form to
`/api/backup/restore`, or use DNS rebinding to read `/api/backup`. `src/proxy.ts`
turns away (403) any request that

- names a host other than `localhost` / `127.0.0.1` / `[::1]` (DNS rebinding),
- comes from another site (`Sec-Fetch-Site: cross-site` or `same-site`, or an
  `Origin` that isn't the server itself), or
- lacks the launch token: main.js makes a random one per launch, passes it to the
  server as `RAPPESPALTER_TOKEN`, and adds it as `x-rappespalter-token` to the
  window's requests to its own server (`authorizeRequests`, via
  `session.webRequest`; pages, fetches and backup downloads alike).

`pnpm dev` runs without a token and relies on the first two. To reach a dev server
from another host name, list it in `RAPPESPALTER_ALLOWED_HOSTS` (comma-separated).

No separate Node.js install is required on the target machine — Electron's own
runtime executes the server. On macOS it runs as the bundled `Rappespalter Helper`
(a background app, `LSUIElement`), not the main binary, which would show a second,
endlessly bouncing Dock icon for the server. There's no fallback: a missing Helper
means a broken install and stops startup with an error.

Starting the server is most of the startup time, so it begins before Electron's
`ready` event, and the window opens straight away on a loading page
([electron/loading.html](../electron/loading.html)), where the name is written
out in one ink line, until the server answers. Its letterforms are the public-domain
Hershey "Script 1-stroke" font, smoothed into curves; each stroke is a `<path>` with
its own start and duration, so the pen moves at a steady speed. Only one copy runs
at a time (`app.requestSingleInstanceLock()`): launching it again, e.g. a second
click while it's starting, focuses the existing window.

### App icon

The icon is [src/app/icon.svg](../src/app/icon.svg) (also the favicon), rendered to
`resources/icon.png` (512 px; Linux, macOS, window icon) and `resources/icon.ico`
(16–256 px; Windows exe, taskbar, installer). Both are committed; after changing the
SVG, run `node scripts/make-icons.mjs` to regenerate them.

### Why the build is wired the way it is

- **`output: "standalone"`** ([next.config.ts](../next.config.ts)) emits a
  self-contained server bundle at `.next/standalone` with only the traced
  `node_modules` it needs.
- **`outputFileTracingIncludes`** force-includes two things the file tracer would
  otherwise miss: the Prisma client generated outside `src/` (`generated/prisma`)
  and `@prisma/adapter-libsql`. (`@libsql/client` is picked up automatically.)
- **`scripts/assemble-standalone.mjs`** runs after `next build` to copy
  `.next/static` and `public/` into the standalone tree (server.js does not copy
  them itself) and to copy the clean `resources/template.db` to `build/resources/template.db`.
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

On first launch this is seeded from `template.db` (schema + default categories,
no data — every build ships the same clean template, never your `dev.db`). Delete
the file to reset to the shipped template.

### Importing a database from the app

For backups, use **Settings → Backup & restore**: *Back up…* saves a copy of all
data wherever you choose (native Save dialog), *Restore…* replaces the data with a
backup after saving a safety copy to `backups/before-restore/` in the data folder.

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

The template is the committed `resources/template.db`, copied as-is by
`pnpm build:desktop`. To change the starting state (e.g. after a schema change or
new default categories), rebuild it from a freshly seeded database — never from
your own `dev.db`:

```bash
rm -f template-new.db
DATABASE_URL="file:./template-new.db" pnpm exec prisma migrate deploy   # schema
DATABASE_URL="file:./template-new.db" pnpm exec prisma db seed          # default categories
mv template-new.db resources/template.db
```

> The server migrates the database when it starts (`src/lib/migrate.ts`, from
> `src/instrumentation.ts`): every migration in `prisma/migrations` the database
> hasn't recorded is applied, so existing users' databases in userData catch up
> after an update. A stale `template.db` would therefore still work, but rebuild it
> after a schema change anyway, so a first launch doesn't have to migrate.

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
robocopy \\wsl$\Ubuntu\home\<you>\dev\rappespalter C:\dev\rappespalter /E /XD node_modules .next dist build .git

cd C:\dev\rappespalter

# 3. install dependencies (pulls the Windows libsql + Electron binaries)
pnpm install

# 4a. build an installer  ->  dist\Rappespalter-Setup.exe
pnpm dist

# 4b. OR build an unpacked, no-install folder you can zip and copy anywhere
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

*Actions → Release → Run workflow* builds the installers on GitHub's runners and
keeps them as workflow artifacts for 3 days, without publishing anything. Pushing a
version tag builds and publishes a release (see [Updates](#updates)). Each system
builds on its own runner because the libsql binary is native:

| System                | Runner           | File                              |
| --------------------- | ---------------- | --------------------------------- |
| Windows x64           | `windows-latest` | `Rappespalter-Setup.exe`          |
| macOS (Apple silicon) | `macos-15`       | `Rappespalter-mac-arm64.dmg` + `.zip` (for updates) |
| Linux x64             | `ubuntu-latest`  | `Rappespalter-linux-x64.AppImage` |

There is no Intel Mac build. The AppImage needs `chmod +x` before it runs. It also
needs `libfuse2`, which Ubuntu 22.04+ and other recent distributions don't install
by default; the README's "Installing" section has the command per distribution.

### Mac signing and notarization

The Mac app is signed with a Developer ID certificate, with hardened runtime, and
notarized by Apple (`mac.hardenedRuntime` / `mac.notarize` in package.json; electron-builder's
default entitlements). An unsigned or ad-hoc signed app downloaded from GitHub gets
"is damaged and can't be opened" on Apple silicon. The Mac job reads five repository secrets
(Settings → Secrets and variables → Actions) and stops if one is missing:

| Secret                        | What                                                                 |
| ----------------------------- | -------------------------------------------------------------------- |
| `MAC_CERTIFICATE_P12`         | the *Developer ID Application* certificate + private key, `.p12`, base64 |
| `MAC_CERTIFICATE_PASSWORD`    | the password the `.p12` was exported with                            |
| `APPLE_ID`                    | the Apple Account email of the developer account                     |
| `APPLE_APP_SPECIFIC_PASSWORD` | an app-specific password for it (account.apple.com → Sign-In and Security) |
| `APPLE_TEAM_ID`               | the 10-character Team ID (developer.apple.com → Account → Membership) |

Getting the certificate (on a Mac): Keychain Access → Certificate Assistant → *Request a
Certificate From a Certificate Authority*, saved to disk; developer.apple.com →
Certificates → + → *Developer ID Application* (G2 Sub-CA), upload the request, download
the `.cer` and double-click it. In Keychain Access → login → My Certificates, export
"Developer ID Application: … (TEAMID)" (with its private key) as `.p12`, then
`base64 -i cert.p12 | pbcopy` for the secret. Keep the `.p12` somewhere safe; the
certificate is valid for 5 years.

Check a build on a Mac:
`spctl -a -vvv -t install /Applications/Rappespalter.app` should say
`accepted, source=Notarized Developer ID`. Copies installed before signing (ad-hoc)
update normally, since updates aren't quarantined.

The Mac build uses `mac.compression: "normal"` instead of the top-level `"maximum"`.
With "maximum", electron-builder zips with 15 Deflate passes (`-mpass=15`), and the
~250 MB `.app` took about 20 minutes on the runner. With "normal" the zip gets a single
pass and the dmg uses zlib instead of bzip2, which costs a few MB.

## Updates

The installed app updates itself on Windows, macOS (Apple silicon) and Linux
(AppImage), but only to versions you promoted by hand:

1. **Release:** bump `version` in package.json, commit, then tag and push the tag:
   ```bash
   git tag v0.1.5 && git push origin v0.1.5
   ```
   [release.yml](../.github/workflows/release.yml) builds the installers for
   Windows, macOS and Linux (above) and publishes them as a **pre-release** with
   `latest.json`: the version, the commits
   since the previous tag as notes, and per system the update package's address,
   size and SHA-256 (Windows: the installer; macOS: the zipped `.app`; Linux: the
   AppImage).
   The run fails if the tag doesn't match package.json. Installed copies never see
   pre-releases.
2. **Try it** by downloading the installer from the pre-release.
3. **Promote:** *Actions → Promote → Run workflow* (empty = the newest release, or
   enter a version). [promote.yml](../.github/workflows/promote.yml) makes it the
   repository's *latest* release, which is what installed copies read. These
   addresses always point to the latest promoted release:
   - installer: `https://github.com/amir-begic/rappespalter/releases/latest/download/Rappespalter-Setup.exe`
     (likewise `Rappespalter-mac-arm64.dmg`, `Rappespalter-linux-x64.AppImage`)
   - feed: `https://github.com/amir-begic/rappespalter/releases/latest/download/latest.json`

The repository must be **public**: the app reads the feed and downloads the
installer without signing in.

**In the app** ([electron/updater.js](../electron/updater.js)): a minute after start
and then every six hours it reads the feed; opening *Settings* checks too if
nothing has been checked yet. A newer version puts a dot on *Settings* in the nav,
and *Settings → Updates → Install update* installs it:

1. downloads this system's package into `updates/` in the data folder and checks
   its size and SHA-256 against the feed (a mismatch is discarded);
2. stops the server and copies the database to `backups/before-update/`
   (the newest 5 are kept);
3. puts the new version in place and quits (`INSTALLERS` in
   [main.js](../electron/main.js)):
   - **Windows:** runs the installer silently as an update
     (`/S --updated --force-run`), which starts the new version when it's done.
   - **macOS:** unpacks the zip into `.Rappespalter-update/` next to the `.app`
     (same volume, so the swap is a rename). A small shell waits for the app to
     exit, moves the old `.app` aside, moves the new one in (or the old one back if
     that fails) and opens it. The folder is removed on the next start. Run from the
     disk image or from a folder you can't write to, unpacking fails up front and
     the app keeps running and says so: move it to Applications first.
   - **Linux:** copies the new AppImage next to the running one and renames it over
     it (the running copy keeps its open file), then a small shell starts it once
     the app has exited. Only a copy run as an AppImage (`$APPIMAGE` set) updates.

`updates/status.json` records the update. On the next start the app marks it as
succeeded (now running the new version) or failed (still the old one: the
update didn't finish), and *Settings → Updates* says so for a week. There is no
automatic rollback: if the new version won't start, its error dialog names the
database copy; reinstall the previous version from its release page and, if needed,
load the copy with *File → Import Database…*.

Versions are compared as `major.minor.patch`. A copy in development (`pnpm
electron:dev`), an Intel Mac, or a Linux copy not run as an AppImage has no
updates. `RAPPESPALTER_UPDATE_FEED` points the app at another `latest.json`, e.g.
for testing.

The Windows installer is unsigned, so SmartScreen warns on the first manual install;
the Mac app is signed and notarized (see above). Updates the app downloads itself
aren't affected either way: they're fetched by the app, not a browser, so they carry
no quarantine flag.

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

- **An update didn't work** — *Settings → Updates* says what happened; details are
  in `startup.log`. Database copies from before each update are in
  `backups\before-update\` in the data folder.
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
