import { AwsClient } from 'aws4fetch'

/**
 * Audio file storage on an S3-compatible service: Cloudflare R2 in production,
 * the S3 endpoint of the local Supabase stack in development.
 *
 * The browser never sees the credentials: the server hands out short-lived
 * presigned URLs to upload (PUT) and stream (GET, with range requests) a file.
 *
 * Requests are signed with AWS Signature V4 through `aws4fetch`, a tiny
 * fetch-based signer that runs on any runtime (Node, Vercel, edge), instead
 * of the much heavier AWS SDK.
 */

export interface AudioStorageConfig {
  /** e.g. https://<account-id>.r2.cloudflarestorage.com */
  endpoint: string
  /** `auto` for R2; `local` for the Supabase S3 endpoint. */
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

/** What a HEAD request reveals about a stored object. */
export interface StoredObject {
  size: number
  contentType: string | null
}

export class AudioStorage {
  private readonly client: AwsClient

  /**
   * @param config storage endpoint, bucket and credentials (server-only)
   * @param fetchImpl injectable for tests (test/unit/server/audio-storage.test.ts)
   */
  constructor(
    private readonly config: AudioStorageConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: 's3',
      region: config.region,
    })
  }

  /**
   * Path-style object URL: `<endpoint>/<bucket>/<key>`.
   * Path style works with both R2 and the Supabase S3 endpoint (virtual-host
   * style would need DNS per bucket). Each key segment is URL-encoded but
   * the `/` separators are kept.
   */
  objectUrl(key: string): string {
    const encodedKey = key.split('/').map(encodeURIComponent).join('/')
    return `${this.config.endpoint.replace(/\/$/, '')}/${encodeURIComponent(this.config.bucket)}/${encodedKey}`
  }

  /**
   * Presigned URL valid for `expiresSeconds` (checked when a request starts:
   * a download already in progress is not cut off at expiry).
   * The signature travels in the query string, so the browser can use the
   * URL directly in `<audio src>` or an XHR PUT without extra headers.
   */
  async presign(method: 'GET' | 'PUT', key: string, expiresSeconds: number): Promise<string> {
    const url = new URL(this.objectUrl(key))
    url.searchParams.set('X-Amz-Expires', String(expiresSeconds))
    const signed = await this.client.sign(new Request(url, { method }), { aws: { signQuery: true } })
    return signed.url
  }

  /**
   * Size and type of a stored object, or null when it does not exist.
   * Used after a direct upload to check that the file is there and has the
   * declared size before the track is registered.
   */
  async head(key: string): Promise<StoredObject | null> {
    const response = await this.request('HEAD', key)
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`Audio storage HEAD failed (${response.status})`)
    return {
      size: Number(response.headers.get('content-length') ?? 0),
      contentType: response.headers.get('content-type'),
    }
  }

  /**
   * Best-effort removal: failures are logged, never thrown.
   * Deleting a track must not fail because its file could not be removed;
   * at worst an orphaned file stays in the bucket. A missing file (404) is
   * already the desired state.
   */
  async remove(keys: string[]): Promise<void> {
    await Promise.all(keys.map(async (key) => {
      try {
        const response = await this.request('DELETE', key)
        if (!response.ok && response.status !== 404) {
          console.error(`[audio-storage.remove] ${key}: HTTP ${response.status}`)
        }
      }
      catch (error) {
        console.error(`[audio-storage.remove] ${key}:`, error)
      }
    }))
  }

  /** Server-side signed request (headers signature) for HEAD and DELETE. */
  private async request(method: 'HEAD' | 'DELETE', key: string): Promise<Response> {
    const signed = await this.client.sign(this.objectUrl(key), { method })
    return this.fetchImpl(signed)
  }
}
