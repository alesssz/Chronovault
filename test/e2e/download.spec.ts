/**
 * End-to-end, download with tags: the file saved by "Download" is the
 * stored FLAC with the track's metadata (title, artist, album, year, genre,
 * comment, lyrics, cover) written in, checked by parsing the downloaded file
 * with music-metadata.
 */
import { readFile } from 'node:fs/promises'
import { parseBuffer } from 'music-metadata'
import { expect, test } from '@playwright/test'
import { signUp, uniqueId, uploadTrack } from './helpers'

/** A valid 1×1 PNG, used as the cover. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test.describe('download with tags', () => {
  test('the downloaded FLAC carries the metadata and the cover', async ({ page }) => {
    await signUp(page)
    // A unique title: it also ends up in the file name and the tags.
    const title = `dl-${uniqueId()}`
    // A WAV: stored as a verified FLAC.
    await uploadTrack(page, title)
    await page.getByRole('link', { name: 'Go to library' }).click()
    const row = page.getByTestId('track-row').filter({ hasText: title })
    await row.getByRole('button', { name: `Actions for ${title}` }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await expect(page).toHaveURL(/\/tracks\/.+\/edit/)
    const trackId = page.url().split('/tracks/')[1]!.split('/')[0]!

    // Metadata through the API (faster than filling the form), genre by name.
    await page.evaluate(async (id) => {
      const genres = await (await fetch('/api/genres')).json() as { id: string, name: string }[]
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
      const w = window as unknown as { progressToastSeen: boolean }
      w.progressToastSeen = false
      new MutationObserver(() => {
        if (document.body.textContent?.includes('Preparing download')) w.progressToastSeen = true
      }).observe(document.body, { childList: true, subtree: true, characterData: true })
    })
    const downloadEvent = page.waitForEvent('download')
    await page.getByTestId('download-track').click()
    const download = await downloadEvent
    expect(download.suggestedFilename()).toBe(`Ada Lovelace - ${title}.flac`)
    await expect(page.getByText(`Downloaded ${title}`).first()).toBeVisible()
    // The toast lists exactly what went into the file.
    await expect(page.getByText('Written in: title, artist, album, year, genre, comment, lyrics, cover.').first()).toBeVisible()

    const file = await readFile((await download.path())!)
    expect(file.subarray(0, 4).toString('latin1')).toBe('fLaC')
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
    // Hold the audio file response back for 1.5 s (the local storage plays R2).
    await page.route('**/storage/v1/s3/**', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1500))
      await route.continue()
    })
    const slowDownload = page.waitForEvent('download')
    await page.getByTestId('download-track').click()
    const progress = page.locator('li', { hasText: 'Preparing download…' })
    await expect(progress).toBeVisible()
    await slowDownload
    await expect(progress).toBeHidden()
    await page.unroute('**/storage/v1/s3/**')
  })
})
