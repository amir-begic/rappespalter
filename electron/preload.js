// Preload. The app is a standard web UI served over localhost; the only native API
// it gets is updates (Settings → Updates, see electron/updater.js). contextIsolation
// stays on, and the main process only answers the main window.
// Typed for the renderer in src/lib/updates.ts.

const { contextBridge, ipcRenderer } = require("electron")

// The main process colours the window buttons to match the theme. Nothing is exposed
// to the page for this: the preload shares its DOM and watches <html data-theme>.
window.addEventListener("DOMContentLoaded", () => {
  const root = document.documentElement
  const report = () => {
    if (root.dataset.theme) ipcRenderer.send("window:theme", root.dataset.theme)
  }
  new MutationObserver(report).observe(root, { attributes: true, attributeFilter: ["data-theme"] })
  report()
})

contextBridge.exposeInMainWorld("rappespalter", {
  updates: {
    state: () => ipcRenderer.invoke("updates:state"),
    check: () => ipcRenderer.invoke("updates:check"),
    install: () => ipcRenderer.invoke("updates:install"),
    onChange: (fn) => {
      const listener = (_event, state) => fn(state)
      ipcRenderer.on("updates:changed", listener)
      return () => ipcRenderer.removeListener("updates:changed", listener)
    },
  },
})
