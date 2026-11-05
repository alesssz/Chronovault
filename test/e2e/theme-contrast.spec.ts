/**
 * End-to-end: the theme's colours read as text in both themes. main.css picks
 * which step of each scale the light and dark themes use; Nuxt UI's own steps
 * (500 light, 400 dark) left gold, yellow, green, blue and red too faint on
 * white. Measured on the colours the browser really resolves, on the page's
 * background and, for the status colours, on the 10% tint of a subtle alert
 * or badge, the palest background they sit on.
 */
import { expect, test } from './fixtures'

/** Text needs 4.5:1 (WCAG AA). */
const TEXT_CONTRAST = 4.5
/** Colours the app writes text in, straight on the page. */
const PAGE_COLOURS = ['primary', 'secondary']
/** Colours also written on their own tint (subtle alerts and badges). */
const STATUS_COLOURS = ['success', 'info', 'warning', 'error']

test.describe('theme contrast', () => {
  for (const theme of ['light', 'dark']) {
    test(`every theme colour reads as text in the ${theme} theme`, async ({ page }) => {
      // The theme chosen before any script of the page runs: set after the first load, the app
      // starting slowly on a cold server could still store its default over it.
      await page.addInitScript(value => localStorage.setItem('nuxt-color-mode', value), theme)
      await page.goto('/login')
      await expect(page.locator('html')).toHaveClass(new RegExp(theme))

      const ratios = await page.evaluate(({ pageColours, statusColours }) => {
        const context = document.createElement('canvas').getContext('2d')!
        const style = getComputedStyle(document.documentElement)
        /** A theme variable, its var() resolved by the browser. */
        const variable = (name: string) => style.getPropertyValue(`--ui-${name}`).trim()
        /** The pixel the layers make painted in order, each [colour, opacity], as RGB 0–255. */
        const paint = (...layers: [string, number][]) => {
          context.clearRect(0, 0, 1, 1)
          for (const [color, alpha] of layers) {
            context.globalAlpha = alpha
            context.fillStyle = color
            context.fillRect(0, 0, 1, 1)
          }
          context.globalAlpha = 1
          return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
        }
        /** WCAG relative luminance. */
        const luminance = (rgb: number[]) => {
          const [r, g, b] = rgb.map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
        }
        /** Contrast of two pixels. */
        const contrast = (a: number[], b: number[]) => {
          const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
          return Math.round(((light! + 0.05) / (dark! + 0.05)) * 100) / 100
        }
        const background = variable('bg')
        // Each colour on the page, and the status colours on their own 10% tint too.
        const result: Record<string, number> = {}
        for (const name of [...pageColours, ...statusColours]) {
          const color = variable(name)
          result[name] = contrast(paint([background, 1]), paint([background, 1], [color, 1]))
          if (statusColours.includes(name)) {
            result[`${name} on its tint`] = contrast(paint([background, 1], [color, 0.1]), paint([background, 1], [color, 0.1], [color, 1]))
          }
        }
        return result
      }, { pageColours: PAGE_COLOURS, statusColours: STATUS_COLOURS })

      for (const [name, ratio] of Object.entries(ratios)) {
        expect.soft(ratio, `${name} (${theme} theme)`).toBeGreaterThanOrEqual(TEXT_CONTRAST)
      }
    })
  }
})
