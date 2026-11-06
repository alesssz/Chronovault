/**
 * End-to-end, playlists: create from a track's menu, add, reorder (persisted), play all, share;
 * a visitor plays and downloads private tracks inside the playlist only; private again → 404. "Play all"
 * starts the playlist even while one of its tracks is playing from the library.
 */
import { expect, test, type Page } from './fixtures'
import { clickAndWaitForApi, seedLibrary, signUp, uniqueId, uploadTrack, waitForHydration } from './helpers'

// The playlist page saves its details with PATCH /api/playlists/:id.
const SAVE_PLAYLIST = { method: 'PATCH', path: /^\/api\/playlists\/[0-9a-f-]+$/ }

/** Opens a library row's menu and its "Add to playlist" submenu. */
async function openAddToPlaylist(page: Page, trackTitle: string) {
  // The library row of that track.
  const row = page.getByTestId('track-row').filter({ hasText: trackTitle })
  await row.getByRole('button', { name: `Actions for ${trackTitle}` }).click()
  await page.getByRole('menuitem', { name: 'Add to playlist' }).click()
}

test.describe('playlists', () => {
  test('create, fill, reorder and share a playlist; private tracks play only through it', async ({ page, browser, context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await signUp(page)
    // Two tracks named uniquely for this test.
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
    // The playlist page's rows.
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

    // The editor's sharing box.
    const shareBox = page.getByTestId('share-box')
    await expect(shareBox).toContainText('Private: only you can listen')
    // Description and visibility are details, changed in their dialog (from the sharing box too).
    await page.getByTestId('playlist-change-visibility').click()
    const details = page.getByRole('dialog', { name: 'Edit playlist details' })
    await details.getByTestId('playlist-field-description').fill('Songs for the road.')
    await details.getByText('Unlisted', { exact: true }).click()
    await clickAndWaitForApi(page, details.getByTestId('save-playlist'), SAVE_PLAYLIST)
    await expect(page.getByText('Changes saved').first()).toBeVisible()
    // Saved: the dialog closes, and the description shows under the title.
    await expect(details).toBeHidden()
    await expect(page.getByTestId('playlist-description')).toHaveText('Songs for the road.')
    await expect(page.getByTestId('private-tracks-warning')).toContainText('2 private tracks included')

    await shareBox.getByTestId('copy-share-link').click()
    // The copied link.
    const shareUrl = await page.evaluate(() => navigator.clipboard.readText())
    expect(shareUrl).toMatch(new RegExp(`^${baseURL}/p/[0-9a-f-]{36}$`))
    // The playlist's id, from the link.
    const playlistId = shareUrl.split('/p/')[1]!
    // The owner's tracks, to know the first one's id.
    const tracks = await page.evaluate(async () =>
      (await (await fetch('/api/tracks')).json()) as { id: string, title: string }[])
    // The first track (private: only audible through the playlist).
    const firstId = tracks.find(t => t.title === first)!.id

    // --- A visitor without an account ---
    const visitorContext = await browser.newContext()
    const visitor = await visitorContext.newPage()
    expect((await visitor.goto(shareUrl))?.status()).toBe(200)

    await expect(visitor.getByTestId('shared-playlist-title')).toHaveText(title)
    await expect(visitor.getByTestId('shared-playlist-description')).toHaveText('Songs for the road.')
    await expect(visitor.locator('meta[property="og:title"]')).toHaveAttribute('content', title)
    await expect(visitor.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
    // The visitor's rows of the shared playlist.
    const visitorRows = visitor.getByTestId('shared-playlist-track')
    await expect(visitorRows).toHaveText([new RegExp(second), new RegExp(first)])
    await expect(visitor.getByTestId('shared-now-playing-title')).toHaveText(second)

    // Private tracks play inside the playlist (once the page is interactive)…
    await waitForHydration(visitor)
    // The row's first button plays it (the next one downloads it).
    await visitorRows.filter({ hasText: first }).getByRole('button').first().click()
    await expect(visitor.getByTestId('shared-now-playing-title')).toHaveText(first)
    await expect(visitor.getByTestId('shared-play')).toHaveAttribute('aria-label', 'Pause')
    // …and download there, as the stored FLAC named after the track.
    const download = visitor.waitForEvent('download')
    await visitorRows.filter({ hasText: first }).getByRole('button', { name: `Download ${first}` }).click()
    expect((await download).suggestedFilename()).toBe(`${first}.flac`)

    // …but still have no page of their own, and nothing private leaks through the API.
    expect((await visitor.request.get(`/api/shared/${firstId}`)).status()).toBe(404)
    // The shared playlist as the API gives it to a visitor.
    const body = await (await visitor.request.get(`/api/shared/playlists/${playlistId}`)).json() as Record<string, unknown>
    expect(JSON.stringify(body)).not.toMatch(/sunoPrompt|mastered|audioPath|audio_path/)
    expect((await visitor.request.get(`/api/playlists/${playlistId}`)).status()).toBe(401)

    // --- Back to private: the link stops working immediately ---
    await page.getByTestId('playlist-edit-details').click()
    await details.getByText('Private', { exact: true }).click()
    // Wait for the server, not the toast: the first save's toast may still be
    // on screen, and the visitor must only try once the playlist is private.
    await clickAndWaitForApi(page, details.getByTestId('save-playlist'), SAVE_PLAYLIST)

    expect((await visitor.goto(shareUrl))?.status()).toBe(404)
    await expect(visitor.getByTestId('shared-not-found')).toContainText('Playlist not available')
    expect((await visitor.request.get(`/api/shared/playlists/${playlistId}/tracks/${firstId}/playback`)).status()).toBe(404)

    await visitorContext.close()
  })

  test('"Play all" starts the playlist even while one of its tracks plays from the library', async ({ page }) => {
    await signUp(page)
    await seedLibrary(page, 3)
    // A playlist of Track 003 then Track 001; its id.
    const playlistId = await page.evaluate(async () => {
      // The seeded tracks, by title.
      const tracks = await (await fetch('/api/tracks')).json() as { id: string, title: string }[]
      const idOf = (title: string) => tracks.find(t => t.title === title)!.id
      const response = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Road', trackIds: [idOf('Track 003'), idOf('Track 001')] }),
      })
      return (await response.json() as { id: string }).id
    })

    // Track 001 plays from the library; "repeat one" keeps it there (the seeded tracks last 0.1 s).
    await page.goto('/')
    await page.getByTestId('track-row').filter({ hasText: 'Track 001' }).getByTestId('track-title').click()
    // The player bar, its title and its repeat button (off → all → one).
    const bar = page.getByTestId('player-bar')
    const playing = bar.getByTestId('player-title')
    await expect(playing).toHaveText('Track 001')
    const repeatButton = bar.getByTestId('player-repeat')
    await repeatButton.click()
    await repeatButton.click()
    await expect(repeatButton).toHaveAttribute('aria-label', 'Repeat: one')

    // The playlist's page, reached inside the app so the library goes on playing: not this playlist.
    await page.getByRole('link', { name: 'Playlists' }).click()
    await page.getByTestId('playlist-card').filter({ hasText: 'Road' }).click()
    await expect(page).toHaveURL(`/playlists/${playlistId}`)
    // Its "Play all" button.
    const playAll = page.getByTestId('playlist-play')
    await expect(playAll).toHaveText('Play all')
    // Before: Track 001 being in the playlist made the button pause and resume the library, and Track 001 stayed.
    await playAll.click()
    await expect(playing).toHaveText('Track 003')
    await expect(playAll).toHaveText('Pause')
  })
})
