/**
 * AudioStorage (R2 client): object URLs, presigned URLs, HEAD and best-effort DELETE, with a fake fetch;
 * and the app's own streaming addresses (signed with the storage secret, checked by /api/stream).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AudioStorage } from '~~/server/repositories/audio-storage'

/** A fake R2 configuration (nothing is ever sent to it: fetch is mocked). */
const config = {
  endpoint: 'https://account123.r2.cloudflarestorage.com/',
  region: 'auto',
  bucket: 'chronovault-audio',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'secret',
}

describe('AudioStorage', () => {
  it('builds path-style object URLs', () => {
    // The client under test (no request is made).
    const storage = new AudioStorage(config)
    expect(storage.objectUrl('user-1/track 1.flac'))
      .toBe('https://account123.r2.cloudflarestorage.com/chronovault-audio/user-1/track%201.flac')
  })

  it('refuses to sign or touch a key that URL parsing would resolve to another file', async () => {
    // Every request is mocked: none may be sent.
    const fetchImpl = vi.fn()
    // The client under test, on the fake fetch.
    const storage = new AudioStorage(config, fetchImpl)
    // Another user's file, reached through a dot segment.
    const forged = 'user-1/../user-2/track-2.flac'
    expect(() => storage.objectUrl(forged)).toThrow(/unsafe storage key/)
    await expect(storage.presign('GET', forged, 60)).rejects.toThrow(/unsafe storage key/)
    await expect(storage.head(forged)).rejects.toThrow(/unsafe storage key/)
    // Removal is best effort: logged, never sent.
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await storage.remove([forged])
    expect(log).toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it('presigns URLs with query-string SigV4 and the requested lifetime', async () => {
    // The client under test (presigning is local: no request).
    const storage = new AudioStorage(config)
    // Parse the presigned URL to check each SigV4 query parameter.
    const url = new URL(await storage.presign('PUT', 'user-1/track-1.flac', 3600))

    expect(url.origin + url.pathname).toBe('https://account123.r2.cloudflarestorage.com/chronovault-audio/user-1/track-1.flac')
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3600')
    expect(url.searchParams.get('X-Amz-Credential')).toMatch(/^AKIDEXAMPLE\/\d{8}\/auto\/s3\/aws4_request$/)
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
    // The secret never appears in a URL handed to the browser.
    expect(url.href).not.toContain('secret')
  })

  it('reads size and type of an existing object, null when missing', async () => {
    // Two answers: the object, then a missing one.
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { 'content-length': '42', 'content-type': 'audio/flac' } }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
    // The client under test, on the fake fetch.
    const storage = new AudioStorage(config, fetchImpl)

    expect(await storage.head('a.flac')).toEqual({ size: 42, contentType: 'audio/flac' })
    expect(await storage.head('missing.flac')).toBeNull()
    // The first request, as sent.
    const request = fetchImpl.mock.calls[0]![0] as Request
    expect(request.method).toBe('HEAD')
    expect(request.headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 /)
  })

  it('removal never throws', async () => {
    // One error status, then a network failure.
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockRejectedValueOnce(new Error('offline'))
    // The client under test, on the fake fetch.
    const storage = new AudioStorage(config, fetchImpl)
    // The failures are logged: silenced here, restored at the end.
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(storage.remove(['a.flac', 'b.flac'])).resolves.toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    log.mockRestore()
  })

  it('lists a folder page by page and decodes the XML', async () => {
    /** One ListObjectsV2 response page; `next` makes it truncated with a continuation token. */
    const page = (keys: string[], next?: string) => new Response(
      `<?xml version="1.0"?><ListBucketResult>${keys.map(k =>
        `<Contents><Key>${k}</Key><LastModified>2026-10-01T10:00:00.000Z</LastModified><Size>7</Size></Contents>`).join('')}`
        + (next ? `<IsTruncated>true</IsTruncated><NextContinuationToken>${next}</NextContinuationToken>` : '<IsTruncated>false</IsTruncated>')
        + '</ListBucketResult>',
      { status: 200 },
    )
    // Two pages: a truncated one with a token (XML-escaped), then the last.
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(page(['user-1/a.flac', 'user-1/b&amp;c.flac'], 'token&amp;2'))
      .mockResolvedValueOnce(page(['user-1/d.flac']))
    // The client under test, on the fake fetch.
    const storage = new AudioStorage(config, fetchImpl)

    // Every object of the folder, both pages together.
    const objects = await storage.list('user-1/')

    expect(objects.map(o => o.key)).toEqual(['user-1/a.flac', 'user-1/b&c.flac', 'user-1/d.flac'])
    expect(objects[0]).toEqual({ key: 'user-1/a.flac', size: 7, lastModified: '2026-10-01T10:00:00.000Z' })
    // The two LIST requests: prefix on the first, continuation token on the second.
    const first = new URL((fetchImpl.mock.calls[0]![0] as Request).url)
    expect(first.pathname).toBe('/chronovault-audio')
    expect(first.searchParams.get('list-type')).toBe('2')
    expect(first.searchParams.get('prefix')).toBe('user-1/')
    // The second request: it carries the decoded continuation token.
    const second = new URL((fetchImpl.mock.calls[1]![0] as Request).url)
    expect(second.searchParams.get('continuation-token')).toBe('token&2')
  })

  it('fails loudly when listing is refused (the clean-up must not guess)', async () => {
    // A client whose every request is refused.
    const storage = new AudioStorage(config, vi.fn().mockResolvedValue(new Response(null, { status: 403 })))
    await expect(storage.list('user-1/')).rejects.toThrow('LIST failed (403)')
  })
})

describe('AudioStorage streaming addresses', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /** The k, e and s query parameters of a streaming address. */
  function parts(url: string) {
    const query = new URL(url, 'https://app.test').searchParams
    return { k: query.get('k')!, e: query.get('e')!, s: query.get('s')! }
  }

  it('builds a relative /api/stream address with the key, the expiry and a signature', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-24T10:00:00Z'))
    // An address valid one hour, made at a fixed time.
    const url = await new AudioStorage(config).streamUrl('user-1/track 1.flac', 3600)

    expect(url.startsWith('/api/stream?')).toBe(true)
    // Its three parts.
    const { k, e, s } = parts(url)
    expect(k).toBe('user-1/track 1.flac')
    expect(Number(e)).toBe(Date.parse('2026-10-24T11:00:00Z') / 1000)
    // HMAC-SHA-256 in URL-safe Base64: 43 characters, no padding.
    expect(s).toMatch(/^[\w-]{43}$/)
  })

  it('accepts its own addresses until they expire', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-24T10:00:00Z'))
    // The client that signs and checks the address.
    const storage = new AudioStorage(config)
    // The parts of an address valid one hour.
    const { k, e, s } = parts(await storage.streamUrl('user-1/track.flac', 3600))

    expect(await storage.verifyStream(k, e, s)).toBe(true)
    vi.setSystemTime(new Date('2026-10-24T11:00:01Z'))
    expect(await storage.verifyStream(k, e, s)).toBe(false)
  })

  it('refuses a changed file, a later expiry, a forged signature or another secret', async () => {
    // The client that signs and checks the address.
    const storage = new AudioStorage(config)
    // The parts of a genuine address, altered one by one below.
    const { k, e, s } = parts(await storage.streamUrl('user-1/track.flac', 3600))

    expect(await storage.verifyStream('user-2/track.flac', e, s)).toBe(false)
    expect(await storage.verifyStream(k, String(Number(e) + 3600), s)).toBe(false)
    // A forged signature: its first character changed. Not the last one: in a 32-byte
    // signature the last base64url character carries only 4 bits, its other 2 are padding
    // the decoder ignores, so swapping e.g. A and B there gives the very same bytes (the
    // same, valid signature), and the test failed on 1 run in 16.
    expect(await storage.verifyStream(k, e, `${s.startsWith('A') ? 'B' : 'A'}${s.slice(1)}`)).toBe(false)
    expect(await storage.verifyStream(k, e, 'not base64!')).toBe(false)
    expect(await storage.verifyStream(k, 'soon', s)).toBe(false)
    // Signed with the storage secret: another deployment's addresses do not work here.
    expect(await new AudioStorage({ ...config, secretAccessKey: 'other' }).verifyStream(k, e, s)).toBe(false)
  })
})
