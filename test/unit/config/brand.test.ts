/**
 * The Chronovault brand kept in one piece (shared/brand.ts). A few things are written twice
 * on purpose, and nothing but this test ties the copies together:
 * - the colours: the scales in app/assets/css/main.css (what Nuxt UI paints the interface with)
 *   and BRAND_COLORS (the browser theme colour, the PWA manifest, the generated icons);
 * - the images in public/: committed files, made by scripts/generate-brand.mjs. Every one the
 *   page head, the PWA manifest and the app point to must exist, and the favicon must draw the
 *   current mark (a change to the geometry without `pnpm generate:brand` is caught here).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { APP_NAME, APP_NAME_PARTS, BRAND_COLORS, FALLBACK_COVER, MARK_STROKES } from '~~/shared/brand'

/** The project's root folder (this file is in test/unit/config/). */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

afterAll(() => {
  vi.unstubAllGlobals()
})

/** The value of a `--color-<name>` variable in main.css (lower case), or undefined. */
function cssColor(name: string): string | undefined {
  // The stylesheet.
  const css = readFileSync(join(ROOT, 'app/assets/css/main.css'), 'utf8')
  return css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]?.toLowerCase()
}

/** What nuxt.config.ts declares about the page head and the PWA (`defineNuxtConfig` is a global there). */
async function nuxtConfig() {
  vi.stubGlobal('defineNuxtConfig', (config: unknown) => config)
  // The config object nuxt.config.ts exports, with the fields read here.
  const { default: config } = await import('~~/nuxt.config') as {
    default: {
      app: { head: { title: string, link: { href: string }[], meta: { name: string, content: string }[] } }
      pwa: { manifest: { name: string, theme_color: string, icons: { src: string }[] } }
    }
  }
  return config
}

describe('brand colours', () => {
  it('are the same in the CSS scales and in shared/brand.ts', () => {
    // The brand sits at 900 of the night scale and at 400 of the other two (see main.css).
    expect(cssColor('night-900')).toBe(BRAND_COLORS.night)
    expect(cssColor('gold-400')).toBe(BRAND_COLORS.gold)
    expect(cssColor('spectral-400')).toBe(BRAND_COLORS.spectral)
  })

  it('give the browser and the installed app the night blue', async () => {
    // The project's Nuxt config.
    const config = await nuxtConfig()
    expect(config.app.head.meta.find(m => m.name === 'theme-color')?.content).toBe(BRAND_COLORS.night)
    expect(config.pwa.manifest.theme_color).toBe(BRAND_COLORS.night)
  })
})

describe('brand name', () => {
  it('is one word made of the two halves the logo colours apart', async () => {
    expect(APP_NAME).toBe('Chronovault')
    expect(APP_NAME_PARTS.join('')).toBe(APP_NAME)
    // The project's Nuxt config.
    const config = await nuxtConfig()
    expect(config.app.head.title).toBe(APP_NAME)
    expect(config.pwa.manifest.name).toBe(APP_NAME)
  })
})

describe('brand images in public/', () => {
  it('include every icon the page head and the PWA manifest point to', async () => {
    // The project's Nuxt config.
    const config = await nuxtConfig()
    // Every file the head links to, every manifest icon, and the classic favicon.ico.
    const files = [...config.app.head.link.map(l => l.href), ...config.pwa.manifest.icons.map(i => i.src), '/favicon.ico']
    // An empty list, or the files to generate with `pnpm generate:brand`.
    expect(files.filter(file => !existsSync(join(ROOT, 'public', file)))).toEqual([])
  })

  it('include the fallback cover, for the app and for link previews', () => {
    expect(existsSync(join(ROOT, 'public', FALLBACK_COVER.app))).toBe(true)
    expect(existsSync(join(ROOT, 'public', FALLBACK_COVER.preview))).toBe(true)
  })

  it('have a favicon that draws the current small mark (regenerated after a change)', () => {
    // The favicon's SVG source.
    const favicon = readFileSync(join(ROOT, 'public/favicon.svg'), 'utf8')
    for (const stroke of MARK_STROKES.small) expect(favicon).toContain(`d="${stroke.d}"`)
  })
})
