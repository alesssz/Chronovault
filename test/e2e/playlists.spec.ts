/**
 * End-to-end, playlists: create from a track's menu, add, reorder (persisted), play all, share;
 * a visitor plays private tracks inside the playlist only; private again → 404.
 */
import { expect, test, type Page } from '@playwright/test'
import { clickAndWaitForApi, signUp, uniqueId, uploadTrack } from './helpers'

// The playlist page saves its details with PATCH /api/playlists/:id.
const SAVE_PLAYLIST = { method: 'PATCH', path: /^\/api\/playlists\/[0-9a-f-]+$/ }

/** Opens a library row's menu and its "Add to playlist" submenu. */
async function openAddToPlaylist(page: Page, trackTitle: string) {
  const row = page.getByTestId('track-row').filter({ hasText: trackTitle })
  await row.getByRole('button', { name: `Actions for ${trackTitle}` }).click()
  await page.getByRole('menuitem', { name: 'Add to playlist' }).click()
}

test.describe('playlists', () => {
  test('create, fill, reorder and share a playlist; private tracks play only through it', async ({ page, browser, context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await signUp(page)
    const first = `first-${uniqueId()}`
    const second = `second-${uniqueId()}`
    // Both tracks stay private.
    await uploadTrack(page, first)
    await uploadTrack(page, second)
    await page.getByRole('link', { name: 'Go to library' }).click()

    // --- A new playlist from a track's menu ---
    const title = `mix-${uniqueId()}`
    await openAddToPlaylist(page, first)
    await page.getByRole('menuitem', { name: 'New playlist…' }).click()
    await page.getByTestId('playlist-create-title').fill(title)
    await page.getByTestId('playlist-create-submit').click()
    await expect(page).toHaveURL(/\/playlists\/[0-9a-f-]{36}$/)
    await expect(page.getByTestId('playlist-title')).toHaveText(title)
    await expect(page.getByTestId('playlist-track')).toHaveCount(1)

    // --- Adding a second track to the existing playlist ---
    await page.getByRole('link', { name: 'Library' }).click()
    await openAddToPlaylist(page, second)
    await page.getByRole('menuitem', { name: title }).click()
    await expect(page.getByText(`Added to ${title}`).first()).toBeVisible()

    // --- The playlist page: order, reorder, details ---
    await page.getByRole('link', { name: 'Playlists' }).click()
    await page.getByTestId('playlist-card').filter({ hasText: title }).click()
    const rows = page.getByTestId('playlist-track')
    await expect(rows.getByTestId('playlist-track-title')).toHaveText([new RegExp(first), new RegExp(second)])

    await rows.nth(1).getByRole('button', { name: `Actions for ${second}` }).click()
    await page.getByRole('menuitem', { name: 'Move up' }).click()
    await expect(rows.getByTestId('playlist-track-title')).toHaveText([new RegExp(second), new RegExp(first)])

    // The order is saved: it survives a reload.
    await page.reload()
    await expect(rows.getByTestId('playlist-track-title')).toHaveText([new RegExp(second), new RegExp(first)])

    // Play all starts the playlist in the player bar.
    await page.getByTestId('playlist-play').click()
    await expect(page.getByTestId('player-bar').getByTestId('player-title')).toHaveText(second)

    const shareBox = page.getByTestId('share-box')
    await expect(shareBox).toContainText('Private: only you can listen')
    await page.getByTestId('playlist-field-description').fill('Songs for the road.')
    await page.getByText('Unlisted', { exact: true }).click()
    await clickAndWaitForApi(page, page.getByTestId('save-playlist'), SAVE_PLAYLIST)
    await expect(page.getByText('Changes saved').first()).toBeVisible()
    await expect(page.getByTestId('private-tracks-warning')).toContainText('2 private tracks included')

    await shareBox.getByTestId('copy-share-link').click()
    const shareUrl = await page.evaluate(() => navigator.clipboard.readText())
    expect(shareUrl).toMatch(new RegExp(`^${baseURL}/p/[0-9a-f-]{36}$`))
    const playlistId = shareUrl.split('/p/')[1]!
    const tracks = await page.evaluate(async () =>
      (await (await fetch('/api/tracks')).json()) as { id: string, title: string }[])
    const firstId = tracks.find(t => t.title === first)!.id

    // --- A visitor without an account ---
    const visitorContext = await browser.newContext()
    const visitor = await visitorContext.newPage()
    expect((await visitor.goto(shareUrl))?.status()).toBe(200)

    await expect(visitor.getByTestId('shared-playlist-title')).toHaveText(title)
    await expect(visitor.getByTestId('shared-playlist-description')).toHaveText('Songs for the road.')
    await expect(visitor.locator('meta[property="og:title"]')).toHaveAttribute('content', title)
    await expect(visitor.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
    const visitorRows = visitor.getByTestId('shared-playlist-track')
    await expect(visitorRows).toHaveText([new RegExp(second), new RegExp(first)])
    await expect(visitor.getByTestId('shared-now-playing-title')).toHaveText(second)

    // Private tracks play inside the playlist…
    await visitorRows.filter({ hasText: first }).getByRole('button').click()
    await expect(visitor.getByTestId('shared-now-playing-title')).toHaveText(first)
    await expect(visitor.getByTestId('shared-play')).toHaveAttribute('aria-label', 'Pause')

    // …but still have no page of their own, and nothing private leaks through the API.
    expect((await visitor.request.get(`/api/shared/${firstId}`)).status()).toBe(404)
    const body = await (await visitor.request.get(`/api/shared/playlists/${playlistId}`)).json() as Record<string, unknown>
    expect(JSON.stringify(body)).not.toMatch(/sunoPrompt|mastered|audioPath|audio_path/)
    expect((await visitor.request.get(`/api/playlists/${playlistId}`)).status()).toBe(401)

    // --- Back to private: the link stops working immediately ---
    await page.getByText('Private', { exact: true }).click()
    // Wait for the server, not the toast: the first save's toast may still be
    // on screen, and the visitor must only try once the playlist is private.
    await clickAndWaitForApi(page, page.getByTestId('save-playlist'), SAVE_PLAYLIST)

    expect((await visitor.goto(shareUrl))?.status()).toBe(404)
    await expect(visitor.getByTestId('shared-not-found')).toContainText('Playlist not available')
    expect((await visitor.request.get(`/api/shared/playlists/${playlistId}/tracks/${firstId}/playback`)).status()).toBe(404)

    await visitorContext.close()
  })
})
