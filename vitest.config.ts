import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

/** Absolute path from a path relative to this file (for the aliases). */
const r = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// The "nuxt" project boots Nuxt while the config is being loaded:
// dummy values silence the Supabase module warnings (tests never hit the network).
process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321'
process.env.SUPABASE_KEY ??= 'test-key'

/**
 * Two test projects:
 *  - unit: plain Node, fast. Pure functions, schemas, mappers, services, store.
 *  - nuxt: Nuxt environment (happy-dom) for Vue components and auto-imports.
 * End-to-end tests (Playwright) live elsewhere: see playwright.config.ts.
 */
export default defineConfig({
  test: {
    projects: [
      {
        resolve: {
          alias: {
            '~~': r('./'),
            '~': r('./app'),
            '#shared': r('./shared'),
          },
        },
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['test/nuxt/**/*.test.ts'],
          environment: 'nuxt',
          // Each file boots Nuxt in a beforeAll hook: a few seconds on an idle
          // machine, past the default 10 s on a busy one (a shared CI runner).
          hookTimeout: 60_000,
          environmentOptions: {
            nuxt: {
              domEnvironment: 'happy-dom',
            },
          },
          env: {
            SUPABASE_URL: 'http://127.0.0.1:54321',
            SUPABASE_KEY: 'test-key',
          },
        },
      }),
    ],
    coverage: {
      provider: 'v8',
      include: ['shared/**/*.ts', 'server/**/*.ts', 'app/**/*.{ts,vue}'],
      exclude: ['shared/types/database.types.ts'],
      // The terminal (and CI's log) gets the totals only; per-file numbers are in coverage/index.html.
      reporter: ['text-summary', 'html'],
      // Floors for `pnpm test:coverage` (run by CI): it fails when a folder's
      // coverage drops below them. Only where unit tests are the main guard
      // (pure code, services, mappers, the player's logic); routes,
      // repositories, components and pages are covered end to end by
      // Playwright, which this report does not count. Each value is the
      // folder's coverage when set, rounded down: raise it when tests raise
      // the coverage, never lower it to let a change through (README 12).
      thresholds: {
        'shared/**': { lines: 100, statements: 99, functions: 100, branches: 97 },
        'server/services/**': { lines: 96, statements: 95, functions: 95, branches: 89 },
        'server/mappers/**': { lines: 100, statements: 92, functions: 100, branches: 80 },
        'app/lib/**': { lines: 75, statements: 72, functions: 72, branches: 67 },
        'app/stores/**': { lines: 94, statements: 93, functions: 94, branches: 85 },
      },
    },
  },
})
