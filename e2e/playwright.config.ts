import { defineConfig } from "@playwright/test"

// End-to-end tests of the packaged desktop app (e2e/app.spec.ts). Build it first:
//   pnpm build:desktop && pnpm exec electron-builder --dir   (or `pnpm dist`)
// then `pnpm test:e2e` (on Linux without a display: `xvfb-run -a pnpm test:e2e`).
export default defineConfig({
  testDir: ".",
  timeout: 180_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
})
