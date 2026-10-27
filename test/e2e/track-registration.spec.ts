/**
 * End-to-end, registering a track twice (a retry after a lost response, a double submit): the
 * repeated POST /api/tracks answers with the track already there and its file stays in storage,
 * playable; and no upload address is handed out for an id already registered, so its file can
 * never be overwritten. Run against the real storage: the bug this guards against deleted it.
 * An upload address also takes only the file it was asked for: its size and type are signed.
 */
import { expect, test } from './fixtures'
import { makeWav, signUp } from './helpers'

test.describe('registering a track twice', () => {
  test('the repeated request keeps the file; an id already registered gets no upload address', async ({ page }) => {
    await signUp(page)
    // A tiny valid WAV, base64 so it crosses into the page.
    const wav = makeWav({ seconds: 0.1 }).toString('base64')

    // Upload, register twice, ask for an upload address again, then check the stored file.
    const result = await page.evaluate(async (wav) => {
      // The file's bytes, decoded in the page.
      const bytes = Uint8Array.from(atob(wav), c => c.charCodeAt(0))
      // The new track's id, chosen by the client as the upload page does.
      const id = crypto.randomUUID()
      // A JSON POST through the page (its session cookie goes along).
      const post = (url: string, body: unknown) => fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      // What upload-url and POST /api/tracks take for this file.
      const request = { trackId: id, extension: 'wav', mimeType: 'audio/wav', sizeBytes: bytes.length }
      const target = await (await post('/api/tracks/upload-url', request)).json() as { uploadUrl: string, audioPath: string }
      await fetch(target.uploadUrl, { method: 'PUT', headers: { 'content-type': 'audio/wav' }, body: bytes })
      // The same registration, sent twice.
      const body = { id, title: 'Twice', audioPath: target.audioPath, mimeType: 'audio/wav', sizeBytes: bytes.length, durationSeconds: 0.1 }
      const first = await post('/api/tracks', body)
      const second = await post('/api/tracks', body)
      // An upload address for the same id, once it is registered.
      const again = await post('/api/tracks/upload-url', request)
      // The stored file, through the player's own streaming address (HEAD: answered from storage).
      const { url } = await (await fetch(`/api/tracks/${id}/playback`)).json() as { url: string }
      const stored = await fetch(url, { method: 'HEAD' })
      return {
        id,
        first: first.status,
        second: second.status,
        secondId: (await second.json() as { id: string }).id,
        again: again.status,
        stored: stored.status,
      }
    }, wav)

    expect(result.first).toBe(201)
    // The repeat answers like the first time, with the same track.
    expect(result.second).toBe(201)
    expect(result.secondId).toBe(result.id)
    // No way to overwrite a registered track's file.
    expect(result.again).toBe(409)
    // And the file is still there.
    expect(result.stored).toBe(200)
  })

  test('an upload address takes only the file it was asked for (size and type are signed)', async ({ page }) => {
    await signUp(page)

    // An address for a 1000-byte FLAC, then PUTs of other files and of that one.
    const statuses = await page.evaluate(async () => {
      // A JSON POST through the page (its session cookie goes along).
      const target = await (await fetch('/api/tracks/upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trackId: crypto.randomUUID(), extension: 'flac', mimeType: 'audio/flac', sizeBytes: 1000 }),
      })).json() as { uploadUrl: string }
      /** PUTs `size` bytes of type `type` to the address and answers the status. */
      const put = (size: number, type: string) =>
        fetch(target.uploadUrl, { method: 'PUT', headers: { 'content-type': type }, body: new Uint8Array(size) }).then(r => r.status)
      return {
        // A much larger file than declared (e.g. trying to store more than the limit).
        larger: await put(5000, 'audio/flac'),
        // The declared size, another type.
        otherType: await put(1000, 'audio/mpeg'),
        // Exactly the file declared.
        declared: await put(1000, 'audio/flac'),
      }
    })

    expect(statuses.larger).toBe(403)
    expect(statuses.otherType).toBe(403)
    expect(statuses.declared).toBe(200)
  })
})
