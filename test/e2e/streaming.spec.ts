/**
 * End-to-end, the app's streaming address (/api/stream), against the real local storage: the
 * HEAD request Chrome sends before casting gets the file's type and size (a presigned storage
 * URL answered it 403, and Chrome closed its device picker), GET reaches the audio through a
 * redirect, with range requests, and a forged or altered address is refused.
 */
import { expect, test } from './fixtures'
import { signUp, uploadTrack } from './helpers'

test.describe('streaming address', () => {
  test('answers HEAD, redirects GET to the audio, refuses a forged address', async ({ page }) => {
    await signUp(page)
    await uploadTrack(page, 'Stream check')
    // The address the player gets for the user's only track (the upload stores it as FLAC).
    const url = await page.evaluate(async () => {
      const tracks = await (await fetch('/api/tracks')).json() as { id: string }[]
      return ((await (await fetch(`/api/tracks/${tracks[0]!.id}/playback`)).json()) as { url: string }).url
    })
    expect(url).toMatch(/^\/api\/stream\?k=.+&e=\d+&s=[\w-]+$/)

    // HEAD, as Chrome sends it before casting: answered by the app, with the stored file's type and size.
    const head = await page.request.head(url)
    expect(head.status()).toBe(200)
    expect(head.headers()['content-type']).toBe('audio/flac')
    expect(Number(head.headers()['content-length'])).toBeGreaterThan(0)
    expect(head.headers()['accept-ranges']).toBe('bytes')
    // A cast device's player runs on another origin.
    expect(head.headers()['access-control-allow-origin']).toBe('*')

    // GET: a redirect to the storage, which serves the file itself (here its first bytes).
    const redirect = await page.request.get(url, { maxRedirects: 0 })
    expect(redirect.status()).toBe(302)
    expect(redirect.headers()['location']).toContain('X-Amz-Signature')
    // The first four bytes, following the redirect to the storage.
    const audio = await page.request.get(url, { headers: { Range: 'bytes=0-3' } })
    expect(audio.status()).toBe(206)
    expect((await audio.body()).toString('latin1')).toBe('fLaC')

    // Anything not signed by the server is refused, without telling whether the file exists.
    const query = new URL(url, 'https://app.test').searchParams
    const forged = new URLSearchParams(query)
    forged.set('k', query.get('k')!.replace(/\.flac$/, '.mp3'))
    expect((await page.request.head(`/api/stream?${forged}`)).status()).toBe(403)
    // The same address with a later expiry: the signature no longer matches.
    const later = new URLSearchParams(query)
    later.set('e', String(Number(query.get('e')) + 60))
    expect((await page.request.get(`/api/stream?${later}`, { maxRedirects: 0 })).status()).toBe(403)
    expect((await page.request.get('/api/stream', { maxRedirects: 0 })).status()).toBe(400)
  })
})
