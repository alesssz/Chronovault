/**
 * Content Security Policy of the HTML pages (auto-imported by Nitro; sent
 * by server/plugins/content-security-policy.ts, production builds only).
 *
 * Scripts run only from the site itself or with the page's nonce, a random
 * value drawn for each response: the inline scripts Nuxt writes into the
 * page (colour mode, payload, import map) carry it, while a script injected
 * through user content could not guess it. Everything else is limited to
 * what the app really loads: the Supabase API (sign-in, cover uploads) and
 * the audio storage (direct uploads, playback, downloads), whose origins
 * come from the runtime config, so the same build works locally, in Docker
 * and on Vercel.
 */

/** The origins the browser talks to besides the site itself (runtime config). */
export interface CspOrigins {
  /** Supabase project URL (`runtimeConfig.public.supabase.url`). */
  supabaseUrl: string
  /** S3 endpoint of the audio bucket (`runtimeConfig.audioStorage.endpoint`). */
  audioEndpoint: string
}

/**
 * Google's Cast sender library, loaded only by the temporary diagnostic
 * page /cast-test (app/lib/google-cast.ts): drop it with that page.
 */
const GOOGLE_CAST_SDK = 'https://www.gstatic.com'

/** The origin (scheme, host, port) of a URL; null when it is empty or not a URL. */
export function originOf(url: string): string | null {
  try {
    return url ? new URL(url).origin : null
  }
  catch {
    return null
  }
}

/** A fresh nonce: 16 random bytes in Base64 (128 bits, as the CSP spec recommends). */
export function createNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
}

/** The policy of one page, allowing inline scripts that carry `nonce`. */
export function contentSecurityPolicy(nonce: string, origins: CspOrigins): string {
  // Supabase and the audio storage; a missing or malformed setting is left out.
  const backends = [originOf(origins.supabaseUrl), originOf(origins.audioEndpoint)].filter(o => o !== null)
  // The audio storage alone: <audio> follows /api/stream's redirect there.
  const audio = originOf(origins.audioEndpoint)

  const directives: Record<string, string[]> = {
    'default-src': ['\'self\''],
    'script-src': ['\'self\'', `'nonce-${nonce}'`, GOOGLE_CAST_SDK],
    // Vue's :style bindings and Nuxt UI's inline styles: not worth a nonce each.
    'style-src': ['\'self\'', '\'unsafe-inline\''],
    // blob: the cover crop editor previews the picked file; data: small inlined icons.
    'img-src': ['\'self\'', 'data:', 'blob:'],
    'font-src': ['\'self\'', 'data:'],
    // blob: wavesurfer can play audio it fetched itself (lyrics sync timeline).
    'media-src': ['\'self\'', 'blob:', ...(audio ? [audio] : [])],
    'connect-src': ['\'self\'', ...backends],
    // The FLAC encoder's worker and the PWA service worker, both served by the site.
    'worker-src': ['\'self\''],
    'object-src': ['\'none\''],
    'base-uri': ['\'self\''],
    'form-action': ['\'self\''],
    // Never framed by another site (clickjacking): X-Frame-Options says the same to old browsers.
    'frame-ancestors': ['\'none\''],
  }
  return Object.entries(directives).map(([name, sources]) => `${name} ${[...new Set(sources)].join(' ')}`).join('; ')
}

/** Matches the start of every `<script` tag (`<script>` or `<script …`). */
const SCRIPT_TAG = /<script(?=[\s>])/g

/**
 * Adds the nonce to every `<script>` tag of some HTML chunks. Used on the
 * tags Nuxt writes around the app (head, start and end of body), never on
 * the app's own markup.
 */
export function addNonce(chunks: string[], nonce: string): string[] {
  return chunks.map(chunk => chunk.replace(SCRIPT_TAG, `<script nonce="${nonce}"`))
}
