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
})
