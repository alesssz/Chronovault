import { expect, test, type Page } from '@playwright/test'
import { FLACDecoder } from '@wasm-audio-decoders/flac'
import { makeWav, signUp, uniqueId, uploadTrack, type WavOptions } from './helpers'

/** A valid 1×1 PNG. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** Downloads the audio file actually stored for the user's only track. */
async function downloadStoredAudio(page: Page): Promise<Buffer> {
  const url = await page.evaluate(async () => {
    const tracks = await (await fetch('/api/tracks')).json() as { id: string }[]
    const playback = await (await fetch(`/api/tracks/${tracks[0]!.id}/playback`)).json() as { url: string }
    return playback.url
  })
  const response = await page.request.get(url)
  expect(response.ok()).toBe(true)
  return Buffer.from(await response.body())
}

/** Integer samples of a WAV produced by `makeWav` (44-byte header). */
function wavSamples(wav: Buffer, bitsPerSample: number): Int32Array {
  const bytes = bitsPerSample / 8
  const samples = new Int32Array((wav.length - 44) / bytes)
  for (let i = 0; i < samples.length; i++) samples[i] = wav.readIntLE(44 + i * bytes, bytes)
  return samples
}

test.describe('library and player', () => {
  test('upload, playback, editing, synced lyrics and deletion', async ({ page }) => {
    await signUp(page)
    await expect(page.getByText('Your library is empty')).toBeVisible()

    // --- Upload of a 24-bit stereo WAV (studio master): converted to a verified FLAC ---
    // The title comes from the file name (the WAV has no tags).
    const title = `e2e-${uniqueId()}`
    const master: WavOptions = { bitsPerSample: 24, channels: 2, sampleRate: 44_100 }
    await uploadTrack(page, title, master)
    await expect(page.getByTestId('upload-conversion')).toContainText('FLAC · lossless, verified bit for bit')

    // The file stored in the cloud is a FLAC that decodes to exactly the WAV samples
    // (checked with an independent decoder, not the one used by the app).
    const stored = await downloadStoredAudio(page)
    expect(stored.subarray(0, 4).toString('latin1')).toBe('fLaC')
    const decoder = new FLACDecoder()
    await decoder.ready
    const decoded = await decoder.decodeFile(new Uint8Array(stored))
    decoder.free()
    expect(decoded.errors).toEqual([])
    expect(decoded.bitDepth).toBe(24)
    const original = wavSamples(makeWav(master), 24)
    const scale = 2 ** 23 - 1
    const restored = new Int32Array(original.length)
    for (let i = 0; i < decoded.samplesDecoded; i++) {
      restored[i * 2] = Math.round(decoded.channelData[0]![i]! * scale)
      restored[i * 2 + 1] = Math.round(decoded.channelData[1]![i]! * scale)
    }
    expect(decoded.samplesDecoded * 2).toBe(original.length)
    expect(Buffer.from(restored.buffer).equals(Buffer.from(original.buffer))).toBe(true)
    await page.getByRole('link', { name: 'Go to library' }).click()

    const row = page.getByTestId('track-row').filter({ hasText: title })
    await expect(row).toBeVisible()

    // --- Playback: clicking the track name plays it, the player bar appears ---
    await row.getByTestId('track-title').click()
    const bar = page.getByTestId('player-bar')
    await expect(bar).toBeVisible()
    await expect(bar.getByTestId('player-title')).toHaveText(title)
    await expect(bar.getByTestId('player-toggle').first()).toHaveAttribute('aria-label', 'Pause')

    // Clicking the name of the track already playing opens the full-screen view.
    await row.getByTestId('track-title').click()
    await expect(page.getByTestId('player-expanded')).toBeVisible()
    await page.getByRole('button', { name: 'Collapse player' }).click()
    await expect(page.getByTestId('player-expanded')).toBeHidden()
    await expect(bar.getByTestId('player-toggle').first()).toHaveAttribute('aria-label', 'Pause')

    // The cover button still toggles playback.
    await row.getByRole('button', { name: `Pause ${title}` }).click()
    await expect(bar.getByTestId('player-toggle').first()).toHaveAttribute('aria-label', 'Play')
    await row.getByRole('button', { name: `Play ${title}` }).click()
    await expect(bar.getByTestId('player-toggle').first()).toHaveAttribute('aria-label', 'Pause')

    // --- Metadata editing (playback continues across pages) ---
    await row.getByRole('button', { name: `Actions for ${title}` }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await expect(page).toHaveURL(/\/tracks\/.+\/edit/)
    await expect(bar).toBeVisible()
    await expect(page.getByText('Format').locator('xpath=following-sibling::dd[1]')).toHaveText('FLAC')

    // --- Cover: resized to WebP in the browser and uploaded to storage ---
    await page.getByTestId('cover-input').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: TINY_PNG })
    await expect(page.getByText('Cover updated').first()).toBeVisible()
    await expect(page.getByRole('img', { name: `Cover of ${title}` }).first())
      .toHaveAttribute('src', /\/storage\/v1\/object\/sign\/covers\//)

    const newTitle = `${title} (master)`
    await page.getByLabel('Title').fill(newTitle)
    await page.getByRole('switch').click()

    // --- Synced lyrics imported from LRC ---
    await page.getByRole('tab', { name: 'Sync' }).click()
    await page.getByRole('button', { name: 'LRC' }).click()
    await page.getByRole('dialog').getByRole('textbox').fill('[Intro]\n[00:00.00] First line\n[Verse 1]\n[00:01.50] Second line')
    await page.getByRole('button', { name: 'Apply' }).click()
    await expect(page.getByText('2 / 2 lines synced')).toBeVisible()

    // --- Sync tools: slower playback, detailed waveform with draggable markers ---
    await page.getByTestId('sync-speed-0.75').click()
    await expect(bar.getByTestId('player-rate')).toHaveText('0.75×')

    const markers = page.getByTestId('sync-timeline').getByTestId('sync-marker')
    await expect(markers).toHaveCount(2)
    const secondRow = page.getByTestId('sync-rows').locator('li').filter({ hasText: 'Second line' })
    await expect(secondRow).toContainText('00:01.50')
    // Drag the second marker to the right: the line now starts later.
    const marker = await markers.nth(1).boundingBox()
    await page.mouse.move(marker!.x + 5, marker!.y + marker!.height / 2)
    await page.mouse.down()
    await page.mouse.move(marker!.x + 45, marker!.y + marker!.height / 2, { steps: 8 })
    await page.mouse.up()
    await expect(secondRow).not.toContainText('00:01.50')

    // Selecting a line highlights it for replay and fine adjustment.
    await secondRow.getByTestId('sync-row-text').click()
    await expect(secondRow.getByTestId('sync-row-text')).toHaveAttribute('aria-pressed', 'true')

    // Leaving the sync tab restores the normal speed.
    await page.getByRole('tab', { name: 'Details' }).click()
    await expect(bar.getByTestId('player-rate')).toBeHidden()

    await page.getByTestId('save-track').click()
    await expect(page.getByText('Changes saved').first()).toBeVisible()
    await expect(bar.getByTestId('player-title')).toHaveText(newTitle)

    // --- Expanded view with lyrics ---
    await bar.getByTestId('player-expand').click()
    const expanded = page.getByTestId('player-expanded')
    await expect(expanded).toBeVisible()
    await expect(expanded.getByTestId('lyrics-synced')).toContainText('First line')
    // Section headers are kept in the synced view.
    await expect(expanded.getByTestId('lyrics-section')).toHaveText(['Intro', 'Verse 1'])
    await expanded.getByRole('button', { name: 'Collapse player' }).click()
    await expect(expanded).toBeHidden()

    // --- Deletion from the library ---
    await page.getByRole('link', { name: 'Back to library' }).click()
    const updatedRow = page.getByTestId('track-row').filter({ hasText: newTitle })
    await expect(updatedRow).toBeVisible()
    await updatedRow.getByRole('button', { name: `Actions for ${newTitle}` }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()

    await expect(updatedRow).toHaveCount(0)
    await expect(bar).toBeHidden()
    await expect(page.getByText('Your library is empty')).toBeVisible()
  })

  test('a floating-point WAV is uploaded unchanged', async ({ page }) => {
    await signUp(page)
    await page.goto('/tracks/new')
    await expect(page.getByTestId('flac-notice')).toBeVisible()
    await page.locator('input[type="file"]').setInputFiles({
      name: 'float-master.wav',
      mimeType: 'audio/wav',
      buffer: makeWav({ bitsPerSample: 32, float: true, channels: 2 }),
    })
    await expect(page.locator('[data-testid="upload-item"][data-status="done"]')).toHaveCount(1, { timeout: 30_000 })
    await expect(page.getByTestId('upload-conversion')).toContainText('Kept as WAV: Floating-point WAV')
  })

  test('a non-audio file is rejected', async ({ page }) => {
    await signUp(page)
    await page.goto('/tracks/new')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'document.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not audio'),
    })
    await expect(page.locator('[data-testid="upload-item"][data-status="error"]')).toContainText('Unsupported format')
  })
})
