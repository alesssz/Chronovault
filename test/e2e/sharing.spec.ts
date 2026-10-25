/**
 * End-to-end, track sharing: an unlisted track opens without an account, never exposes the Suno
 * prompt or mastering status, and answers 404 once private again.
 */
import { expect, test } from '@playwright/test'
import { clickAndWaitForApi, signUp, uniqueId, uploadTrack, waitForHydration } from './helpers'

// The edit page saves with PATCH /api/tracks/:id.
const SAVE_TRACK = { method: 'PATCH', path: /^\/api\/tracks\/[0-9a-f-]+$/ }

test.describe('public sharing', () => {
  test('an unlisted track opens without an account; a private one does not', async ({ page, browser, context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await signUp(page)
    // A title unique to this test.
    const title = `share-${uniqueId()}`
    await uploadTrack(page, title)
    await page.getByRole('link', { name: 'Go to library' }).click()

    // The library row of the new track.
    const row = page.getByTestId('track-row').filter({ hasText: title })
    await row.getByRole('button', { name: `Actions for ${title}` }).click()
    // A private track has no public page.
    await expect(page.getByRole('menuitem', { name: 'Copy share link' })).toHaveCount(0)
    await page.getByRole('menuitem', { name: 'Edit' }).click()

    // The editor's sharing box.
    const shareBox = page.getByTestId('share-box')
    await expect(shareBox).toContainText('Private: only you can listen')

    // --- Metadata, including the fields that must never be shared ---
    const secretPrompt = `secret-prompt-${uniqueId()}`
    await page.getByTestId('field-description').fill('Written on a rainy night.')
    await page.getByTestId('field-suno-prompt').fill(secretPrompt)
    await page.getByRole('switch', { name: 'Mastering' }).click()
    await page.getByText('Unlisted', { exact: true }).click()
    await clickAndWaitForApi(page, page.getByTestId('save-track'), SAVE_TRACK)
    await expect(page.getByText('Changes saved').first()).toBeVisible()

    // --- The share link ---
    await shareBox.getByTestId('copy-share-link').click()
    await expect(page.getByText('Share link copied').first()).toBeVisible()
    // The copied link.
    const shareUrl = await page.evaluate(() => navigator.clipboard.readText())
    expect(shareUrl).toMatch(new RegExp(`^${baseURL}/t/[0-9a-f-]{36}$`))

    // --- A visitor without an account ---
    const visitorContext = await browser.newContext()
    const visitor = await visitorContext.newPage()
    const response = await visitor.goto(shareUrl)
    expect(response?.status()).toBe(200)

    await expect(visitor.getByTestId('shared-title')).toHaveText(title)
    await expect(visitor.getByTestId('shared-description')).toHaveText('Written on a rainy night.')
    // Server-rendered link preview; unlisted tracks stay out of search engines.
    await expect(visitor.locator('meta[property="og:title"]')).toHaveAttribute('content', title)
    await expect(visitor.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')

    // Never shared: the Suno prompt and the mastering status (neither in the page nor in the API).
    const html = await visitor.content()
    expect(html).not.toContain(secretPrompt)
    expect(html.toLowerCase()).not.toContain('mastered')
    // The track's id, from the link.
    const trackId = shareUrl.split('/t/')[1]!
    // The track as the API gives it to a visitor, and its fields.
    const api = await visitor.request.get(`/api/shared/${trackId}`)
    expect(api.ok()).toBe(true)
    // Its fields, to check that nothing private is among them.
    const body = await api.json() as Record<string, unknown>
    expect(body).not.toHaveProperty('sunoPrompt')
    expect(body).not.toHaveProperty('mastered')
    expect(body).not.toHaveProperty('audioPath')
    expect(JSON.stringify(body)).not.toContain(secretPrompt)

    // The library API stays closed to visitors.
    expect((await visitor.request.get(`/api/tracks/${trackId}`)).status()).toBe(401)

    // The visitor can play the track (once the page is interactive).
    await waitForHydration(visitor)
    // The share page's play button.
    const play = visitor.getByTestId('shared-play')
    await play.click()
    await expect(play).toHaveAttribute('aria-label', 'Pause')

    // --- Back to private: the link stops working immediately ---
    await page.getByText('Private', { exact: true }).click()
    // Wait for the server, not the toast: the first save's toast may still be
    // on screen, and the visitor must only try once the track is private.
    await clickAndWaitForApi(page, page.getByTestId('save-track'), SAVE_TRACK)

    // The share page once the track is private again.
    const closed = await visitor.goto(shareUrl)
    expect(closed?.status()).toBe(404)
    await expect(visitor.getByTestId('shared-not-found')).toContainText('Track not available')
    expect((await visitor.request.get(`/api/shared/${trackId}/playback`)).status()).toBe(404)

    await visitorContext.close()
  })
})
