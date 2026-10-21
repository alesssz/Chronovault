/**
 * End-to-end, cacheable covers: the library shows covers at stable app
 * addresses (/api/covers/...) that the browser may keep for a year, the
 * address changes only when the cover does, and only the owner can read it.
 */
import { expect, test, type Page } from '@playwright/test'
import { signUp, uniqueId, uploadTrack } from './helpers'

// A 1×1 PNG: the crop editor turns it into the stored WebP cover.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** Sets a cover from the edit page (keeping the crop editor's centered square). */
async function setCover(page: Page): Promise<void> {
  await page.getByTestId('cover-input').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: TINY_PNG })
  await page.getByTestId('crop-confirm').click()
  await expect(page.getByText('Cover updated').first()).toBeVisible()
}

test.describe('cover cache', () => {
  test('covers have stable, cacheable, owner-only addresses', async ({ page, browser }) => {
    await signUp(page)
    const title = `cache-${uniqueId()}`
    await uploadTrack(page, title)
    await page.getByRole('link', { name: 'Go to library' }).click()
    const row = page.getByTestId('track-row').filter({ hasText: title })
    await row.getByRole('button', { name: `Actions for ${title}` }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await setCover(page)

    // --- The library shows the cover at an app address… ---
    await page.goto('/')
    const cover = page.getByRole('img', { name: `Cover of ${title}` }).first()
    await expect(cover).toHaveAttribute('src', /^\/api\/covers\/tracks\/[0-9a-f-]+\?v=/)
    const src = (await cover.getAttribute('src'))!

    // …served as an image the browser keeps for a year (overriding the /api no-store).
    const response = await page.request.get(src)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('image/webp')
    expect(response.headers()['cache-control']).toBe('private, max-age=31536000, immutable')

    // --- The same address on the next visit: the cached copy is reused ---
    await page.reload()
    await expect(cover).toHaveAttribute('src', src)

    // --- A new cover gets a new address, so the browser fetches it fresh ---
    await row.getByRole('button', { name: `Actions for ${title}` }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await setCover(page)
    await page.goto('/')
    await expect(cover).toHaveAttribute('src', /^\/api\/covers\/tracks\//)
    expect(await cover.getAttribute('src')).not.toBe(src)

    // --- Only the owner: another user gets 404, a visitor without session 401 ---
    const other = await browser.newContext()
    try {
      const otherPage = await other.newPage()
      expect((await otherPage.request.get(src)).status()).toBe(401)
      await signUp(otherPage)
      expect((await otherPage.request.get(src)).status()).toBe(404)
    }
    finally {
      await other.close()
    }
  })
})
