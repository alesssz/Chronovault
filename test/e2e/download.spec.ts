/**
 * End-to-end, download with tags: the file saved by "Download" is the
 * stored FLAC with the track's metadata (title, artist, album, year, genre,
 * comment, lyrics, cover) written in, checked by parsing the downloaded file
 * with music-metadata.
 */
import { readFile } from 'node:fs/promises'
import { parseBuffer } from 'music-metadata'
import { expect, test } from './fixtures'
import { signUp, TINY_PNG, uniqueId, uploadTrack } from './helpers'

test.describe('download with tags', () => {
  test('the downloaded FLAC carries the metadata and the cover', async ({ page }) => {
    // The page's clock under the test's control (it runs as usual until paused below).
    await page.clock.install()
    await signUp(page)
    // A unique title: it also ends up in the file name and the tags.
    const title = `dl-${uniqueId()}`
    // A WAV: stored as a verified FLAC.
    await uploadTrack(page, title)
    await page.getByRole('link', { name: 'Go to library' }).click()
    // The library row of the new track.
    const row = page.getByTestId('track-row').filter({ hasText: title })
    await row.getByRole('button', { name: `Actions for ${title}` }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await expect(page).toHaveURL(/\/tracks\/.+\/edit/)
    // The track's id, from the edit page's address.
    const trackId = page.url().split('/tracks/')[1]!.split('/')[0]!

    // Metadata through the API (faster than filling the form), genre by name.
    await page.evaluate(async (id) => {
      // The built-in genres, to pick one by name.
      const genres = await (await fetch('/api/genres')).json() as { id: string, name: string }[]
      // The metadata saved through the API.
      const response = await fetch(`/api/tracks/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          composers: 'Ada Lovelace',
          album: 'Notturni',
          year: 2026,
          genreId: genres.find(g => g.name === 'Ambient')!.id,
          description: 'Written on a rainy night.',
          lyrics: '[Verse 1]\nFirst line\nSecond line',
          sunoPrompt: 'never-in-the-file',
        }),
      })
      if (!response.ok) throw new Error(`PATCH failed: ${response.status}`)
    }, trackId)

    // The cover through the UI (crop editor, upload to storage).
    await page.getByTestId('cover-input').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: TINY_PNG })
    await page.getByTestId('crop-confirm').click()
    await expect(page.getByText('Cover updated').first()).toBeVisible()

    // --- Download (fast: no progress toast may flash before the final one) ---
    // Records whether "Preparing download…" ever appears, even for an instant.
    await page.evaluate(() => {
      // Where the observer records it.
      const w = window as unknown as { progressToastSeen: boolean }
      w.progressToastSeen = false
      new MutationObserver(() => {
        if (document.body.textContent?.includes('Preparing download')) w.progressToastSeen = true
      }).observe(document.body, { childList: true, subtree: true, characterData: true })
    })
    // The clock stops for the download: "Preparing download…" waits 700 ms of the page's time, and
    // a slow runner could take that long for a download that is fast for any user, failing the
    // test for nothing. Stopped, only a download that never ends could show it. (pauseAt jumps to a
    // moment ahead, then stops: a second on, before the click, when no download timer exists yet.)
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000))
    // The next download, started by the button below.
    const downloadEvent = page.waitForEvent('download')
    await page.getByTestId('download-track').click()
    // The file saved.
    const download = await downloadEvent
    // A second past the 700 ms: a progress timer left running (not cleared when the download ended)
    // would show "Preparing download…" now, and the observer above would see it. Then the clock
    // runs again, for the toasts that follow.
    await page.clock.runFor(1_000)
    await page.clock.resume()
    expect(download.suggestedFilename()).toBe(`Ada Lovelace - ${title}.flac`)
    await expect(page.getByText(`Downloaded ${title}`).first()).toBeVisible()
    // The toast lists exactly what went into the file.
    await expect(page.getByText('Written in: title, artist, album, year, genre, comment, lyrics, cover.').first()).toBeVisible()

    // Its bytes.
    const file = await readFile((await download.path())!)
    expect(file.subarray(0, 4).toString('latin1')).toBe('fLaC')
    // The tags written in keep the SEEKTABLE right after STREAMINFO (block type 3).
    expect(file[42]! & 0x7f).toBe(3)
    // Its tags and format, read back by music-metadata.
    const { common, format } = await parseBuffer(file, { mimeType: 'audio/flac' })
    expect(format.container).toBe('FLAC')
    expect(common.title).toBe(title)
    expect(common.artist).toBe('Ada Lovelace')
    expect(common.album).toBe('Notturni')
    expect(common.year).toBe(2026)
    expect(common.genre).toEqual(['Ambient'])
    expect(common.comment?.[0]?.text).toBe('Written on a rainy night.')
    expect(common.lyrics?.[0]?.text).toBe('[Verse 1]\nFirst line\nSecond line')
    expect(common.picture?.[0]?.format).toBe('image/jpeg')
    // Personal notes never end up in the file.
    expect(file.includes(Buffer.from('never-in-the-file'))).toBe(false)
    expect(await page.evaluate(() => (window as unknown as { progressToastSeen: boolean }).progressToastSeen)).toBe(false)

    // --- Download (slow: the progress toast shows, neutral, then goes away) ---
    // Hold the audio file back for 1.5 s. The app's streaming address is held, not the storage
    // URL it redirects to: Playwright only intercepts the first request of a redirect chain.
    await page.route('**/api/stream?**', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1500))
      await route.continue()
    })
    // The next download (slowed down by the route above).
    const slowDownload = page.waitForEvent('download')
    await page.getByTestId('download-track').click()
    // The progress toast.
    const progress = page.locator('li', { hasText: 'Preparing download…' })
    await expect(progress).toBeVisible()
    await slowDownload
    await expect(progress).toBeHidden()
    await page.unroute('**/api/stream?**')
  })
})
