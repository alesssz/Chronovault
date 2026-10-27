/**
 * End-to-end, leaving the upload page while files are in progress: going to another page of the
 * app asks first, as closing the tab does. Staying keeps everything going; leaving lets the file
 * in progress finish, and the files not started yet are not uploaded. The queue used to carry on
 * in the background with nothing showing it, and coming back started a second queue beside it.
 */
import { expect, test, type Page } from './fixtures'
import { makeWav, signUp } from './helpers'

/** How many tracks the library holds (read through the page's session). */
async function trackCount(page: Page): Promise<number> {
  return page.evaluate(async () => (await (await fetch('/api/tracks')).json() as unknown[]).length)
}

test.describe('leaving the upload page', () => {
  test('asks first; once left, only the file in progress is uploaded', async ({ page }) => {
    await signUp(page)
    await page.goto('/tracks/new')

    // The first file's upload to storage held back a few seconds: it is still in progress when
    // the test tries to leave.
    let held = false
    await page.route(url => url.pathname.includes('/storage/v1/s3/'), async (route) => {
      if (route.request().method() === 'PUT' && !held) {
        held = true
        await new Promise(resolve => setTimeout(resolve, 4_000))
      }
      await route.continue()
    })

    // Three files at once: one is processed at a time, the other two wait their turn.
    await page.locator('input[type="file"]').setInputFiles(['one', 'two', 'three'].map(name => ({
      name: `${name}.wav`,
      mimeType: 'audio/wav',
      buffer: makeWav(),
    })))
    await expect(page.locator('[data-testid="upload-item"][data-status="uploading"]')).toHaveCount(1)

    // Back to the library: the question comes; staying keeps the page and its uploads.
    let asked = 0
    page.once('dialog', async (dialog) => {
      asked++
      await dialog.dismiss()
    })
    await page.getByRole('link', { name: 'Back to library' }).click()
    await expect.poll(() => asked).toBe(1)
    await expect(page).toHaveURL(/\/tracks\/new$/)

    // Asked again, and this time leaving.
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('link', { name: 'Back to library' }).click()
    await expect(page).toHaveURL(/\/$/)

    // The file in progress finishes and is registered…
    await expect.poll(() => trackCount(page), { timeout: 20_000 }).toBe(1)
    // …and the two waiting files never start (a few seconds, during which the next one would
    // have been analyzed, uploaded and registered).
    await page.waitForTimeout(4_000)
    expect(await trackCount(page)).toBe(1)
  })
})
