/**
 * End-to-end, storage clean-up: an interrupted upload (file stored, track
 * never registered) shows up as an orphan in the Storage dialog and is
 * deleted, while the files of real tracks are left untouched.
 * The e2e server runs with NUXT_STORAGE_CLEANUP_MIN_AGE_HOURS=0 (see playwright.config.ts).
 */
import { expect, test } from '@playwright/test'
import { signUp, uniqueId, uploadTrack } from './helpers'

test.describe('storage clean-up', () => {
  test('finds and deletes the file of an interrupted upload, and only that', async ({ page }) => {
    await signUp(page)
    const title = `kept-${uniqueId()}`
    await uploadTrack(page, title)
    await page.goto('/')

    // An interrupted upload: the file reaches the storage, the track is never registered.
    await page.evaluate(async () => {
      // 2 KB of filler: the size shows up in the dialog as "2.0 KB".
      const body = new Uint8Array(2048).fill(7)
      const target = await (await fetch('/api/tracks/upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trackId: crypto.randomUUID(), extension: 'mp3', mimeType: 'audio/mpeg', sizeBytes: body.length }),
      })).json() as { uploadUrl: string }
      const put = await fetch(target.uploadUrl, { method: 'PUT', body, headers: { 'content-type': 'audio/mpeg' } })
      if (!put.ok) throw new Error(`upload failed: ${put.status}`)
    })

    await page.getByRole('button', { name: 'User menu' }).click()
    await page.getByRole('menuitem', { name: 'Storage' }).click()
    const report = page.getByTestId('storage-report')
    await expect(report).toBeVisible()
    await expect(report.getByTestId('storage-orphan')).toHaveCount(1)
    await expect(report.getByTestId('storage-orphan')).toContainText('2.0 KB')
    await expect(report.getByTestId('storage-orphan')).toContainText('Will be deleted')

    await page.getByTestId('storage-delete').click()
    await expect(page.getByText('Deleted 1 file').first()).toBeVisible()
    await expect(page.getByTestId('storage-clean')).toBeVisible()

    // The real track still has its file and plays.
    const status = await page.evaluate(async () => {
      const [track] = await (await fetch('/api/tracks')).json() as { id: string }[]
      const { url } = await (await fetch(`/api/tracks/${track!.id}/playback`)).json() as { url: string }
      return (await fetch(url, { headers: { range: 'bytes=0-15' } })).status
    })
    expect([200, 206]).toContain(status)
  })
})
