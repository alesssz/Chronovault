/**
 * Content Security Policy of the HTML pages (auto-imported by Nitro; sent
 * by server/plugins/content-security-policy.ts, production builds only).
 *
 * Scripts run only from the site itself or with the page's nonce, a random
 * value drawn for each response: the inline scripts Nuxt writes into the
 * page (colour mode, payload, import map) carry it, while a script injected
 * through user content could not guess it (and user text is never given it:
 * see addNonce). Everything else is limited to what the app really loads:
 * Supabase (sign-in, cover uploads, the share pages' signed cover URLs) and
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
  // Supabase alone: the share pages show covers at signed Storage URLs (sharing.service.ts).
  const supabase = originOf(origins.supabaseUrl)

  const directives: Record<string, string[]> = {
    'default-src': ['\'self\''],
    'script-src': ['\'self\'', `'nonce-${nonce}'`, GOOGLE_CAST_SDK],
    // Vue's :style bindings and Nuxt UI's inline styles: not worth a nonce each.
    'style-src': ['\'self\'', '\'unsafe-inline\''],
    // blob: the cover crop editor previews the picked file; data: small inlined icons;
    // Supabase: the covers of the share pages (/t, /p), signed Storage URLs. The owner's
    // pages use the app's own /api/covers addresses instead.
    'img-src': ['\'self\'', 'data:', 'blob:', ...(supabase ? [supabase] : [])],
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

/** A tag's start: `<`, then its name (`script`, `meta`, `link`…), matched at one position (sticky). */
const TAG_START = /<([a-z][^\s/>]*)/iy

/**
 * Adds the nonce to every `<script>` tag of some HTML chunks. Used on the
 * tags Nuxt writes around the app (head, start and end of body), never on
 * the app's own markup.
 *
 * Only real tags get it, never text that merely looks like one. The head
 * carries user text: a share page's title and description go into its link
 * preview tags (`<meta property="og:title" content="…">`), where unhead
 * escapes the `"` but leaves `<` as it is. A plain search for `<script`
 * found one in a title like `x<script a><script>…</script>`, and the `"` of
 * the nonce it wrote there closed the attribute: the text became a real
 * script, carrying the page's own nonce, which the policy then let run. So
 * the chunks are read tag by tag, the way a browser does: attribute values,
 * comments and the contents of scripts and styles are copied as they are.
 */
export function addNonce(chunks: string[], nonce: string): string[] {
  return chunks.map(chunk => nonceScripts(chunk, nonce))
}

/** One chunk of HTML with the nonce written into each of its `<script>` tags. */
function nonceScripts(html: string, nonce: string): string {
  // The chunk in lower case, to find closing tags whatever their case.
  const lower = html.toLowerCase()
  // The chunk rewritten so far.
  let out = ''
  // Where reading resumes.
  let i = 0
  while (i < html.length) {
    // The next `<`: everything before it is text, copied as is.
    const lt = html.indexOf('<', i)
    if (lt === -1) return out + html.slice(i)
    out += html.slice(i, lt)

    // A comment, up to its end (a `<script` inside it is not a tag).
    if (html.startsWith('<!--', lt)) {
      // Just past `-->`, or the chunk's end when it is never closed.
      const stop = endOf(html, '-->', lt + 4)
      out += html.slice(lt, stop)
      i = stop
      continue
    }

    TAG_START.lastIndex = lt
    // The tag's name, when a tag starts here (a lone `<` in text does not).
    const name = TAG_START.exec(html)?.[1]?.toLowerCase()
    if (!name) {
      out += '<'
      i = lt + 1
      continue
    }
    // Just past the tag's `>`.
    const end = tagEnd(html, lt + 1 + name.length)
    // `<script` (7 characters) gets the nonce right after its name.
    out += name === 'script' ? `<script nonce="${nonce}"${html.slice(lt + 7, end)}` : html.slice(lt, end)
    i = end

    // A script's or style's contents are not markup: copied up to their closing tag.
    if (name === 'script' || name === 'style') {
      // Where the closing tag starts, or the chunk's end.
      const close = lower.indexOf(`</${name}`, end)
      const stop = close === -1 ? html.length : close
      out += html.slice(end, stop)
      i = stop
    }
  }
  return out
}

/** Just past the next `marker` from `from`, or the end of `html` when there is none. */
function endOf(html: string, marker: string, from: number): number {
  // Where the marker starts.
  const at = html.indexOf(marker, from)
  return at === -1 ? html.length : at + marker.length
}

/**
 * Just past the `>` that closes a tag, reading its attributes from `from`
 * (right after the tag's name). A quoted value is skipped whole: a `>` or a
 * `<script` inside it is text. A quote opens a value only right after `=`,
 * as in HTML.
 */
function tagEnd(html: string, from: number): number {
  // The last character that is not a space (an `=` there means a value starts).
  let previous = ''
  for (let i = from; i < html.length; i++) {
    // The character read.
    const c = html[i]!
    if (c === '>') return i + 1
    if ((c === '"' || c === '\'') && previous === '=') {
      // Past the closing quote (the value cannot contain its own quote).
      i = endOf(html, c, i + 1) - 1
      previous = c
      continue
    }
    if (!/\s/.test(c)) previous = c
  }
  return html.length
}
