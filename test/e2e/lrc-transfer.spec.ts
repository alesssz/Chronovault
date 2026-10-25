/**
 * End-to-end, moving synced lyrics between Chronovaults (e.g. from the
 * local app to production):
 *  - the LRC dialog opens an .lrc file, and exports by copy and download;
 *  - a downloaded FLAC carries the synced lyrics, and uploading it again
 *    (here into another account, standing in for another Chronovault)
 *    brings them back.
 */
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { clickAndWaitForApi, signUp, uniqueId, uploadTrack } from './helpers'

/** Plain lyrics of the track, with a section header. */
const LYRICS = '[Verse 1]\nFirst line\nSecond line'
/** Their sync, as an .lrc file would hold it (inside the 3-second test WAV). */
const LRC = '[00:01.50] [Verse 1]\n[00:01.50] First line\n[00:02.25] Second line'
/** What the app stores for that sync: the header takes its line's time. */
const SYNCED = [
  { time: 1.5, text: '[Verse 1]', section: true },
  { time: 1.5, text: 'First line' },
  { time: 2.25, text: 'Second line' },
]

test.describe('synced lyrics transfer', () => {
  test('LRC import from a file and export; synced lyrics travel inside the downloaded file', async ({ page, browser, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await signUp(page)
    const title = `lrc-${uniqueId()}`
    await uploadTrack(page, title)
    await page.getByRole('link', { name: 'Go to library' }).click()
    const row = page.getByTestId('track-row').filter({ hasText: title })
    await row.getByRole('button', { name: `Actions for ${title}` }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await expect(page).toHaveURL(/\/tracks\/.+\/edit/)
    const trackId = page.url().split('/tracks/')[1]!.split('/')[0]!

    // Plain lyrics through the API, then a reload so the page shows them.
    await page.evaluate(async ({ id, lyrics }) => {
      const response = await fetch(`/api/tracks/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lyrics }),
      })
      if (!response.ok) throw new Error(`PATCH failed: ${response.status}`)
    }, { id: trackId, lyrics: LYRICS })
    await page.reload()

    // --- Import: open an .lrc file in the dialog, apply, save ---
    await page.getByRole('tab', { name: 'Sync' }).click()
    await page.getByRole('button', { name: 'LRC' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByTestId('lrc-file-input').setInputFiles({ name: 'song.lrc', mimeType: 'text/plain', buffer: Buffer.from(LRC) })
    await expect(dialog.getByRole('textbox')).toHaveValue(LRC)
    await dialog.getByRole('button', { name: 'Apply' }).click()
    await clickAndWaitForApi(page, page.getByTestId('save-track'), { method: 'PATCH', path: /^\/api\/tracks\/[0-9a-f-]+$/ })

    // --- Export: the dialog opens on the saved sync; copy and download it ---
    await page.getByRole('button', { name: 'LRC' }).click()
    await expect(dialog.getByRole('textbox')).toHaveValue(LRC)
    await dialog.getByTestId('lrc-copy').click()
    await expect(page.getByText('LRC copied').first()).toBeVisible()
    // The Windows clipboard turns line breaks into CRLF (parseLrc reads both).
    expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(LRC)
    const lrcDownload = page.waitForEvent('download')
    await dialog.getByTestId('lrc-download').click()
    const lrcFile = await lrcDownload
    expect(lrcFile.suggestedFilename()).toBe(`${title}.lrc`)
    expect(await readFile((await lrcFile.path())!, 'utf8')).toBe(LRC)
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    // --- The downloaded FLAC carries the sync ---
    const audioDownload = page.waitForEvent('download')
    await page.getByTestId('download-track').click()
    const flac = await readFile((await (await audioDownload).path())!)
    await expect(page.getByText(/Written in: .*synced lyrics/).first()).toBeVisible()

    // --- Uploaded into another account ("production"): the sync comes back ---
    const otherContext = await browser.newContext()
    try {
      const other = await otherContext.newPage()
      await signUp(other)
      await other.goto('/tracks/new')
      await other.locator('input[type="file"]').setInputFiles({ name: `${title}.flac`, mimeType: 'audio/flac', buffer: flac })
      await expect(other.locator('[data-testid="upload-item"][data-status="done"]')).toHaveCount(1, { timeout: 30_000 })

      const uploaded = await other.evaluate(async (wanted) => {
        const tracks = await (await fetch('/api/tracks')).json() as { id: string, title: string }[]
        const id = tracks.find(t => t.title === wanted)!.id
        return await (await fetch(`/api/tracks/${id}`)).json() as { lyrics: string, lyricsSynced: unknown }
      }, title)
      expect(uploaded.lyrics).toBe(LYRICS)
      expect(uploaded.lyricsSynced).toEqual(SYNCED)
    }
    finally {
      await otherContext.close()
    }
  })
})
