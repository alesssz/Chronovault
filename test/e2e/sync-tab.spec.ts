/**
 * End-to-end, the edit page of the track playing does not download its audio file while the Sync
 * tab stays closed. The Sync tab's detailed waveform fetches and decodes the whole file (tens of
 * MB on a real track); its editor is mounted hidden with the page, so the waveform waits for the
 * tab to be opened. The player's own <audio> element streams the file as before: only the
 * waveform's download (a fetch of the streaming address) is counted.
 */
import { expect, test } from './fixtures'
import { signUp, uploadTrack } from './helpers'

test.describe('Sync tab', () => {
  test('the waveform downloads the file only once Sync is opened', async ({ page }) => {
    await signUp(page)
    // Long enough to keep playing for the whole test.
    await uploadTrack(page, 'Lazy waveform', { seconds: 60 })
    await page.getByRole('link', { name: 'Go to library' }).click()

    // The track playing, then its edit page (the player keeps playing).
    const row = page.getByTestId('track-row').filter({ hasText: 'Lazy waveform' })
    await row.getByTestId('track-title').click()
    await expect(page.getByTestId('player-bar').getByTestId('player-title')).toHaveText('Lazy waveform')

    // The waveform's downloads: fetches (not the <audio> element's media requests) of the file.
    let downloads = 0
    page.on('request', (request) => {
      if (request.resourceType() === 'fetch' && request.url().includes('/api/stream')) downloads++
    })

    await row.getByRole('button', { name: 'Actions for Lazy waveform' }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await expect(page.getByTestId('field-title')).toBeVisible()
    // A while on the Details tab: the hidden editor used to start the download at once.
    await page.waitForTimeout(2_000)
    expect(downloads).toBe(0)

    // Opening Sync builds the waveform, which downloads the file.
    await page.getByRole('tab', { name: 'Sync' }).click()
    await expect.poll(() => downloads, { timeout: 15_000 }).toBeGreaterThan(0)
  })
})
