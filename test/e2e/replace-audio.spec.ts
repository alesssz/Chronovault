/**
 * End-to-end, Replace audio (docs/07-data-flows.md 7.19): a track uploaded
 * before mastering gets a new file from its editor's File section. Its
 * metadata and lyrics stay, the duration is the new file's, the old file is
 * deleted (no orphan left in the Storage report), and the synced lyrics are
 * flagged for checking: the Sync tab's badge and warning, the library's icon
 * in the warning colour, until "Sync checked".
 */
import { expect, test } from './fixtures'
import { makeWav, signUp, uploadTrack } from './helpers'

test.describe('Replace audio', () => {
  test('swaps the file, keeps the metadata, and flags the sync until it is checked', async ({ page }) => {
    await signUp(page)
    // The "unmastered" track: 3 seconds.
    await uploadTrack(page, 'Montgisard', { seconds: 3 })

    // Lyrics synced to it, saved straight through the API (the sync editor is tested elsewhere).
    const id = await page.evaluate(async () => {
      // The library, to find the track's id.
      const tracks = await (await fetch('/api/tracks')).json() as { id: string, title: string }[]
      // The track just uploaded.
      const track = tracks.find(t => t.title === 'Montgisard')!
      await fetch(`/api/tracks/${track.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lyrics: 'Crowned at thirteen\nA silver mask',
          lyricsSynced: [{ time: 0.5, text: 'Crowned at thirteen' }, { time: 2, text: 'A silver mask' }],
        }),
      })
      return track.id
    })

    await page.goto(`/tracks/${id}/edit`)
    // The File section, with the stored file's duration.
    const file = page.locator('section[aria-labelledby="track-file-heading"]')
    await expect(file).toContainText('0:03')

    // The "master": 5 seconds, picked in the dialog.
    await file.getByTestId('replace-audio').click()
    // The dialog, open.
    const dialog = page.getByRole('dialog', { name: 'Replace audio' })
    await expect(dialog.getByTestId('replace-audio-sync-note')).toBeVisible()
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'Montgisard (master).wav', mimeType: 'audio/wav', buffer: makeWav({ seconds: 5 }) })
    // The file chosen shows in the drop zone's place before anything is sent.
    await expect(dialog.getByTestId('replace-audio-file')).toContainText('Montgisard (master).wav')
    await expect(dialog.getByTestId('replace-audio-file')).toContainText('WAV')
    await dialog.getByTestId('replace-audio-confirm').click()

    // Done: the dialog closes, the file is the new one, the metadata the track's own.
    await expect(dialog).toBeHidden({ timeout: 30_000 })
    await expect(file).toContainText('0:05')
    await expect(page.getByTestId('field-title')).toHaveValue('Montgisard')

    // The sync is flagged: a badge on the tab, the warning inside it.
    const syncTab = page.getByRole('tab', { name: /Sync/ })
    await expect(syncTab).toContainText('Check')
    await syncTab.click()
    // The warning above the sync editor.
    const alert = page.getByTestId('sync-check-alert')
    await expect(alert).toContainText('Audio file replaced')

    // The library shows the synced-lyrics icon in the warning colour meanwhile.
    await page.goto('/')
    // The track's row in the library.
    const row = page.getByTestId('track-row').filter({ hasText: 'Montgisard' })
    await expect(row.getByTestId('track-lyrics-icon')).toHaveClass(/text-warning/)

    // "Sync checked" clears it: no warning, no badge, the usual icon.
    await page.goto(`/tracks/${id}/edit`)
    await page.getByRole('tab', { name: /Sync/ }).click()
    await page.getByTestId('sync-check-alert').getByRole('button', { name: 'Sync checked' }).click()
    await expect(page.getByTestId('sync-check-alert')).toBeHidden()
    await expect(page.getByRole('tab', { name: /Sync/ })).not.toContainText('Check')
    await page.goto('/')
    await expect(page.getByTestId('track-row').filter({ hasText: 'Montgisard' }).getByTestId('track-lyrics-icon')).toHaveClass(/text-primary/)

    // The synced lines themselves are untouched, and the old file is gone: no orphan in storage.
    const after = await page.evaluate(async (trackId) => {
      // The track as saved.
      const track = await (await fetch(`/api/tracks/${trackId}`)).json() as { lyricsSynced: unknown[], audioPath: string, syncNeedsReview: boolean }
      // The storage report: files no track or playlist uses.
      const storage = await (await fetch('/api/storage')).json() as { orphans: unknown[] }
      return { lines: track.lyricsSynced.length, audioPath: track.audioPath, flagged: track.syncNeedsReview, orphans: storage.orphans.length }
    }, id)
    expect(after).toMatchObject({ lines: 2, flagged: false, orphans: 0 })
    expect(after.audioPath).toMatch(new RegExp(`/${id}\\.[0-9a-f]{8}\\.flac$`))
  })
})
