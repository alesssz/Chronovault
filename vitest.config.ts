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
    },
  },
})
