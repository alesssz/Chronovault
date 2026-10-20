// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  ignores: ['shared/types/database.types.ts', 'playwright-report/**', 'test-results/**', 'coverage/**', '.pnpm-store/**'],
})
