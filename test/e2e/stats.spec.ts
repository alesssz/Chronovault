/**
 * End-to-end, Statistics page. The e2e server does not run on Vercel, so the
 * page shows demo data: it must say so, and be built around the user's
 * real items. The API itself is checked for auth and validation.
 */
import { expect, test } from './fixtures'
import { signUp, uniqueId, uploadTrack } from './helpers'

test.describe('statistics', () => {
  test('demo statistics outside Vercel, clearly flagged', async ({ page, browser }) => {
    await signUp(page)
    // A title unique to this test.
    const title = `stats-${uniqueId()}`
    await uploadTrack(page, title)
    await page.getByRole('link', { name: 'Go to library' }).click()

    // --- Opened from the account menu ---
    await page.getByRole('button', { name: 'User menu' }).click()
    await page.getByRole('menuitem', { name: 'Statistics' }).click()
    await expect(page).toHaveURL(/\/stats$/)
    await expect(page.getByRole('heading', { name: 'Statistics' })).toBeVisible()

    // --- Demo data, said loudly, around the user's real track ---
    await expect(page.getByTestId('stats-demo-banner')).toContainText('Demo data')
    // Readable in the light theme too: its title at 4.5:1 or more on the alert's tint (it was
    // yellow on pale yellow, 1.8:1).
    await page.evaluate(() => localStorage.setItem('nuxt-color-mode', 'light'))
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/light/)
    const contrast = await page.getByTestId('stats-demo-banner').evaluate((banner) => {
      const context = document.createElement('canvas').getContext('2d')!
      /** The pixel the colours make painted in order (the page, the alert's tint, the text), as RGB 0–255. */
      const paint = (...colors: string[]) => {
        context.clearRect(0, 0, 1, 1)
        for (const color of ['white', ...colors]) {
          context.fillStyle = color
          context.fillRect(0, 0, 1, 1)
        }
        return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
      }
      /** WCAG relative luminance. */
      const luminance = (rgb: number[]) => {
        const [r, g, b] = rgb.map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
      }
      const background = getComputedStyle(document.body).backgroundColor
      const tint = getComputedStyle(banner).backgroundColor
      const title = getComputedStyle(banner.querySelector('[data-slot="title"]')!).color
      const [light, dark] = [luminance(paint(background, tint)), luminance(paint(background, tint, title))].sort((a, b) => b - a)
      return (light! + 0.05) / (dark! + 0.05)
    })
    expect(contrast).toBeGreaterThanOrEqual(4.5)
    await page.evaluate(() => localStorage.removeItem('nuxt-color-mode'))
    await page.reload()
    await expect(page.getByTestId('stats-item').filter({ hasText: title })).toBeVisible()
    // One chart for views, one for plays: 30 days each.
    await expect(page.getByTestId('stats-views-chart').getByTestId('stats-day-bar')).toHaveCount(30)
    await expect(page.getByTestId('stats-plays-chart').getByTestId('stats-day-bar')).toHaveCount(30)
    // Plays are the app's own count, real even here: nobody listened yet.
    await expect(page.getByTestId('stats-plays')).toHaveText('0')
    // Not on Vercel: the analytics script (served only by Vercel) is not even loaded.
    await expect(page.locator('script[src*="/_vercel/insights"]')).toHaveCount(0)

    // --- The period switch reloads the report ---
    await page.getByTestId('stats-period-7').click()
    await expect(page.getByTestId('stats-views-chart').getByTestId('stats-day-bar')).toHaveCount(7)
    await expect(page.getByTestId('stats-plays-chart').getByTestId('stats-day-bar')).toHaveCount(7)
    await expect(page.getByTestId('stats-period-7')).toHaveAttribute('aria-pressed', 'true')

    // --- The API: validated query, sign-in required ---
    expect((await page.request.get('/api/analytics?days=90')).status()).toBe(400)
    // The 7-day report (demo data outside Vercel).
    const report = await (await page.request.get('/api/analytics?days=7')).json() as { source: string, daily: unknown[] }
    expect(report.source).toBe('demo')
    expect(report.daily).toHaveLength(7)
    // The 7-day plays (none yet).
    const plays = await (await page.request.get('/api/analytics/plays?days=7')).json() as { daily: unknown[], ownPlays: number }
    expect(plays.daily).toHaveLength(7)
    expect(plays.ownPlays).toBe(0)

    // A visitor without an account, in another browser context.
    const visitorContext = await browser.newContext()
    try {
      expect((await visitorContext.request.get(`${test.info().project.use.baseURL}/api/analytics`)).status()).toBe(401)
      expect((await visitorContext.request.get(`${test.info().project.use.baseURL}/api/analytics/plays`)).status()).toBe(401)
    }
    finally {
      await visitorContext.close()
    }
  })
})
