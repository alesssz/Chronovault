/**
 * End-to-end, Statistics page. The e2e server does not run on Vercel, so the
 * page shows demo data: it must say so, and be built around the user's
 * real items. The API itself is checked for auth and validation.
 */
import { expect, test } from '@playwright/test'
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
