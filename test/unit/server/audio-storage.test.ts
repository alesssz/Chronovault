/**
 * AudioStorage (R2 client): object URLs, presigned URLs, HEAD and best-effort DELETE, with a fake fetch.
 */
import { describe, expect, it, vi } from 'vitest'
import { AudioStorage } from '~~/server/repositories/audio-storage'

const config = {
  endpoint: 'https://account123.r2.cloudflarestorage.com/',
  region: 'auto',
  bucket: 'chronoplayer-audio',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'secret',
}

describe('AudioStorage', () => {
  it('builds path-style object URLs', () => {
    const storage = new AudioStorage(config)
    expect(storage.objectUrl('user-1/track 1.flac'))
      .toBe('https://account123.r2.cloudflarestorage.com/chronoplayer-audio/user-1/track%201.flac')
  })

  it('presigns URLs with query-string SigV4 and the requested lifetime', async () => {
    const storage = new AudioStorage(config)
    const url = new URL(await storage.presign('PUT', 'user-1/track-1.flac', 3600))

    expect(url.origin + url.pathname).toBe('https://account123.r2.cloudflarestorage.com/chronoplayer-audio/user-1/track-1.flac')
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3600')
    expect(url.searchParams.get('X-Amz-Credential')).toMatch(/^AKIDEXAMPLE\/\d{8}\/auto\/s3\/aws4_request$/)
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
    // The secret never appears in a URL handed to the browser.
    expect(url.href).not.toContain('secret')
  })

  it('reads size and type of an existing object, null when missing', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { 'content-length': '42', 'content-type': 'audio/flac' } }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
    const storage = new AudioStorage(config, fetchImpl)

    expect(await storage.head('a.flac')).toEqual({ size: 42, contentType: 'audio/flac' })
    expect(await storage.head('missing.flac')).toBeNull()
    const request = fetchImpl.mock.calls[0]![0] as Request
    expect(request.method).toBe('HEAD')
    expect(request.headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 /)
  })

  it('removal never throws', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockRejectedValueOnce(new Error('offline'))
    const storage = new AudioStorage(config, fetchImpl)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(storage.remove(['a.flac', 'b.flac'])).resolves.toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    log.mockRestore()
  })

  it('lists a folder page by page and decodes the XML', async () => {
    const page = (keys: string[], next?: string) => new Response(
      `<?xml version="1.0"?><ListBucketResult>${keys.map(k =>
        `<Contents><Key>${k}</Key><LastModified>2026-10-01T10:00:00.000Z</LastModified><Size>7</Size></Contents>`).join('')}`
        + (next ? `<IsTruncated>true</IsTruncated><NextContinuationToken>${next}</NextContinuationToken>` : '<IsTruncated>false</IsTruncated>')
        + '</ListBucketResult>',
      { status: 200 },
    )
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(page(['user-1/a.flac', 'user-1/b&amp;c.flac'], 'token&amp;2'))
      .mockResolvedValueOnce(page(['user-1/d.flac']))
    const storage = new AudioStorage(config, fetchImpl)

    const objects = await storage.list('user-1/')

    expect(objects.map(o => o.key)).toEqual(['user-1/a.flac', 'user-1/b&c.flac', 'user-1/d.flac'])
    expect(objects[0]).toEqual({ key: 'user-1/a.flac', size: 7, lastModified: '2026-10-01T10:00:00.000Z' })
    const first = new URL((fetchImpl.mock.calls[0]![0] as Request).url)
    expect(first.pathname).toBe('/chronoplayer-audio')
    expect(first.searchParams.get('list-type')).toBe('2')
    expect(first.searchParams.get('prefix')).toBe('user-1/')
    const second = new URL((fetchImpl.mock.calls[1]![0] as Request).url)
    expect(second.searchParams.get('continuation-token')).toBe('token&2')
  })

  it('fails loudly when listing is refused (the clean-up must not guess)', async () => {
    const storage = new AudioStorage(config, vi.fn().mockResolvedValue(new Response(null, { status: 403 })))
    await expect(storage.list('user-1/')).rejects.toThrow('LIST failed (403)')
  })
})
