import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests: they run the real app against the local Supabase stack.
 * Prerequisites: `make db-start` (Docker) and the .env file (`make env`).
 *
 * By default they run on a production build (port 3100): faster and closer
 * to the deployed app. With E2E_DEV=1 they use the dev server (port 3000).
 */
const useDev = process.env.E2E_DEV === '1'
const PORT = Number(process.env.E2E_PORT ?? (useDev ? 3000 : 3100))
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: 'test/e2e',
  // One worker: tests share one local database and one server.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    // Debugging aids, kept only for failed tests (see test-results/ and playwright-report/).
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // The production server reads its runtime config (audio storage keys…) from the environment.
    command: useDev ? `pnpm dev --port ${PORT}` : 'pnpm build && node --env-file=.env .output/server/index.mjs',
    // Storage clean-up without the 24-hour safety delay, so the e2e test can delete the orphans it creates.
    env: { PORT: String(PORT), NUXT_STORAGE_CLEANUP_MIN_AGE_HOURS: '0' },
    url: `${baseURL}/api/health`,
    // Locally, a server already running on the port is reused (note: it may be an old build).
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
})
