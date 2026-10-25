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

/** One object of a bucket listing. */
export interface ListedObject {
  key: string
  size: number
  /** ISO timestamp of the last upload. */
  lastModified: string
}

/** What a HEAD request reveals about a stored object. */
export interface StoredObject {
  size: number
  contentType: string | null
}

/** S3-compatible client for the audio bucket: presigned URLs, HEAD, DELETE, LIST. */
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
    return `${this.bucketUrl()}/${encodedKey}`
  }

  /**
   * Presigned URL valid for `expiresSeconds` (checked when a request starts:
   * a download already in progress is not cut off at expiry).
   * The signature travels in the query string, so the browser can use the
   * URL directly in `<audio src>` or an XHR PUT without extra headers.
   */
  async presign(method: 'GET' | 'PUT', key: string, expiresSeconds: number): Promise<string> {
    // The lifetime goes in the query string, signed together with the rest.
    const url = new URL(this.objectUrl(key))
    url.searchParams.set('X-Amz-Expires', String(expiresSeconds))
    const signed = await this.client.sign(new Request(url, { method }), { aws: { signQuery: true } })
    return signed.url
  }

  // --- The app's own streaming address (/api/stream) ------------------------------------
  //
  // Why not hand out the presigned GET itself: before offering to cast, Chrome on
  // Android checks the media address with a HEAD request, and a presigned URL only
  // answers the method it was signed for, so the HEAD got a 403 and Chrome closed
  // its device picker at once ("The prompt was dismissed"). The app's address
  // answers HEAD itself and redirects GET to a presigned URL (server/api/stream.ts).
  // It carries its own signature: a cast device has no session, so the address
  // alone must say which file it may play, and until when.

  /** HMAC key of the streaming addresses, derived once from the storage secret (see streamKey). */
  private streamKeyPromise: Promise<CryptoKey> | null = null

  /**
   * The app's streaming address of a file, valid for `expiresSeconds`:
   * `/api/stream?k=<key>&e=<expiry, unix seconds>&s=<signature>`. Relative:
   * the player resolves it against the site, and a cast device gets the
   * absolute form (the element's `currentSrc`).
   */
  async streamUrl(key: string, expiresSeconds: number): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + expiresSeconds
    const signature = base64Url(await crypto.subtle.sign('HMAC', await this.streamKey(), streamPayload(key, expires)))
    return `/api/stream?${new URLSearchParams({ k: key, e: String(expires), s: signature })}`
  }

  /**
   * Whether a streaming address's parts are genuine and not expired. The
   * signature is checked by Web Crypto (constant time), so a forged one
   * reveals nothing; a changed key or expiry no longer matches it.
   */
  async verifyStream(key: string, expires: string, signature: string): Promise<boolean> {
    if (!/^\d{1,12}$/.test(expires) || Number(expires) * 1000 < Date.now()) return false
    const bytes = fromBase64Url(signature)
    if (!bytes) return false
    return crypto.subtle.verify('HMAC', await this.streamKey(), bytes, streamPayload(key, Number(expires)))
  }

  /**
   * HMAC-SHA-256 key for the streaming addresses, from the storage secret
   * with a fixed prefix (so it is never the storage key itself). No extra
   * setting to deploy; rotating the storage secret just ends the addresses
   * already handed out, which only live 6 hours anyway.
   */
  private streamKey(): Promise<CryptoKey> {
    this.streamKeyPromise ??= crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(`chronovault-stream:${this.config.secretAccessKey}`),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    )
    return this.streamKeyPromise
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

  /**
   * Every object whose key starts with `prefix` (S3 ListObjectsV2, followed
   * page by page: at most 1000 keys per response). Used by the storage
   * clean-up, always with a user's folder as the prefix.
   */
  async list(prefix: string): Promise<ListedObject[]> {
    // Objects of every page, in key order (as S3 returns them).
    const objects: ListedObject[] = []
    // Continuation token of the next page (S3 returns at most 1000 keys per page).
    let token: string | null = null
    do {
      // ListObjectsV2 is a GET on the bucket itself, with parameters in the query.
      const url = new URL(this.bucketUrl())
      url.searchParams.set('list-type', '2')
      url.searchParams.set('prefix', prefix)
      if (token) url.searchParams.set('continuation-token', token)
      const signed = await this.client.sign(url.toString(), { method: 'GET' })
      const response = await this.fetchImpl(signed)
      if (!response.ok) throw new Error(`Audio storage LIST failed (${response.status})`)
      const xml = await response.text()
      objects.push(...parseListedObjects(xml))
      token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? xmlValue(xml, 'NextContinuationToken') : null
    } while (token)
    return objects
  }

  /** `<endpoint>/<bucket>` (path style, like objectUrl). */
  private bucketUrl(): string {
    return `${this.config.endpoint.replace(/\/$/, '')}/${encodeURIComponent(this.config.bucket)}`
  }

  /** Server-side signed request (headers signature) for HEAD and DELETE. */
  private async request(method: 'HEAD' | 'DELETE', key: string): Promise<Response> {
    const signed = await this.client.sign(this.objectUrl(key), { method })
    return this.fetchImpl(signed)
  }
}

// --- Streaming address helpers ----------------------------------------------------------

/** What a streaming address signs: the file and the expiry, on one line (keys hold no newline). */
function streamPayload(key: string, expires: number): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${key}\n${expires}`)
}

/** URL-safe Base64 without padding (the signature travels in a query string). */
function base64Url(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString('base64url')
}

/** Bytes of a URL-safe Base64 string, or null when it is not one. */
function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[\w-]+$/.test(text)) return null
  return new Uint8Array(Buffer.from(text, 'base64url'))
}

// --- ListObjectsV2 XML ------------------------------------------------------------------
// The response is small and regular: a few regular expressions are enough,
// no XML library needed.

/** Decodes the five predefined XML entities (keys may contain `&`, `<`…). */
function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&amp;/g, '&')
}

/** Text of the first `<tag>…</tag>` in `xml`, decoded, or null. */
function xmlValue(xml: string, tag: string): string | null {
  // Non-greedy, multi-line: the first <tag>…</tag> pair.
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml)
  return match ? decodeXml(match[1]!) : null
}

/** The `<Contents>` entries of a ListObjectsV2 response. */
export function parseListedObjects(xml: string): ListedObject[] {
  // One entry per <Contents> element; entries without a key are skipped.
  const objects: ListedObject[] = []
  for (const [, body] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const key = xmlValue(body!, 'Key')
    if (!key) continue
    objects.push({
      key,
      size: Number(xmlValue(body!, 'Size') ?? 0),
      lastModified: xmlValue(body!, 'LastModified') ?? new Date(0).toISOString(),
    })
  }
  return objects
}
