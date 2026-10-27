/**
 * Content Security Policy of the HTML pages (server/utils/content-security-policy.ts):
 * the directives, the origins taken from the runtime config, the nonce and
 * where it is written.
 */
import { describe, expect, it } from 'vitest'
import { addNonce, contentSecurityPolicy, createNonce, originOf } from '~~/server/utils/content-security-policy'

/** The origins of a local stack: Supabase and its S3 endpoint share a host. */
const LOCAL = { supabaseUrl: 'http://127.0.0.1:54321', audioEndpoint: 'http://127.0.0.1:54321/storage/v1/s3' }

/** A policy split into its directives: `{ 'script-src': ['self', …] }`. */
function directivesOf(policy: string): Record<string, string[]> {
  return Object.fromEntries(policy.split('; ').map((d) => {
    // The directive's name, then its sources.
    const [name, ...sources] = d.split(' ')
    return [name, sources]
  }))
}

describe('originOf', () => {
  it('keeps scheme, host and port only', () => {
    expect(originOf('https://abc.r2.cloudflarestorage.com/chronovault-audio')).toBe('https://abc.r2.cloudflarestorage.com')
    expect(originOf('http://127.0.0.1:54321/storage/v1/s3')).toBe('http://127.0.0.1:54321')
  })

  it('gives null for an empty or malformed setting', () => {
    expect(originOf('')).toBeNull()
    expect(originOf('not a url')).toBeNull()
  })
})

describe('createNonce', () => {
  it('draws 16 random bytes, different every time', () => {
    // Two nonces in a row.
    const [a, b] = [createNonce(), createNonce()]
    expect(atob(a)).toHaveLength(16)
    expect(a).not.toBe(b)
  })
})

describe('contentSecurityPolicy', () => {
  it('allows scripts from the site and with the nonce only (and the temporary Cast SDK)', () => {
    // The local stack's policy, split into directives.
    const d = directivesOf(contentSecurityPolicy('abc123', LOCAL))
    expect(d['script-src']).toEqual(['\'self\'', '\'nonce-abc123\'', 'https://www.gstatic.com'])
    expect(d['script-src']).not.toContain('\'unsafe-inline\'')
    expect(d['object-src']).toEqual(['\'none\''])
    expect(d['frame-ancestors']).toEqual(['\'none\''])
  })

  it('lets the page reach Supabase and the audio storage, listed once when they share an origin', () => {
    // The local stack's policy, split into directives.
    const d = directivesOf(contentSecurityPolicy('n', LOCAL))
    expect(d['connect-src']).toEqual(['\'self\'', 'http://127.0.0.1:54321'])
    expect(d['media-src']).toEqual(['\'self\'', 'blob:', 'http://127.0.0.1:54321'])
    expect(d['img-src']).toEqual(['\'self\'', 'data:', 'blob:', 'http://127.0.0.1:54321'])
  })

  it('lists each origin of a deployment with Supabase Cloud and R2', () => {
    // A deployment's policy, split into directives.
    const d = directivesOf(contentSecurityPolicy('n', {
      supabaseUrl: 'https://xyz.supabase.co',
      audioEndpoint: 'https://abc.r2.cloudflarestorage.com',
    }))
    expect(d['connect-src']).toEqual(['\'self\'', 'https://xyz.supabase.co', 'https://abc.r2.cloudflarestorage.com'])
    expect(d['media-src']).toEqual(['\'self\'', 'blob:', 'https://abc.r2.cloudflarestorage.com'])
    // The share pages' covers are signed Supabase Storage URLs; the audio storage holds no images.
    expect(d['img-src']).toEqual(['\'self\'', 'data:', 'blob:', 'https://xyz.supabase.co'])
  })

  it('leaves out a missing setting instead of writing an invalid source', () => {
    // A policy without any configured backend, split into directives.
    const policy = contentSecurityPolicy('n', { supabaseUrl: '', audioEndpoint: '' })
    expect(directivesOf(policy)['connect-src']).toEqual(['\'self\''])
    expect(directivesOf(policy)['img-src']).toEqual(['\'self\'', 'data:', 'blob:'])
    expect(policy).not.toContain('null')
  })
})

describe('addNonce', () => {
  it('adds the nonce to every script tag, inline or not', () => {
    // Nuxt's head: an inline script, an external module and a JSON payload.
    const head = ['<script>(()=>{})()</script><script type="module" src="/_nuxt/e.js"></script>', '<script type="application/json" id="__NUXT_DATA__">[]</script>']
    expect(addNonce(head, 'n1')).toEqual([
      '<script nonce="n1">(()=>{})()</script><script nonce="n1" type="module" src="/_nuxt/e.js"></script>',
      '<script nonce="n1" type="application/json" id="__NUXT_DATA__">[]</script>',
    ])
  })

  it('leaves other tags alone, look-alikes included', () => {
    // Tags whose names only start like <script>.
    const html = ['<link rel="modulepreload" href="/a.js"><scripted-element></scripted-element><noscript>x</noscript>']
    expect(addNonce(html, 'n1')).toEqual(html)
  })

  it('never turns user text in an attribute into a script', () => {
    // A share page's link preview as unhead writes it: the title's `"` escaped, its `<` not.
    const head = ['<meta property="og:title" content="x<script a><script>alert(1)</script>"><script>boot()</script>']
    // Before: `<script nonce="n1" a>` inside the value, whose `"` closed it, and a real script after it.
    expect(addNonce(head, 'n1')).toEqual([
      '<meta property="og:title" content="x<script a><script>alert(1)</script>"><script nonce="n1">boot()</script>',
    ])
  })

  it('reads single-quoted values, and a `>` inside a value, as part of the value', () => {
    // Values that hold a `>` and a `<script`, then a real script.
    const head = ['<meta name="a" content=\'1 > 0 <script>\'><meta content = "<script>"><script></script>']
    expect(addNonce(head, 'n1')).toEqual([
      '<meta name="a" content=\'1 > 0 <script>\'><meta content = "<script>"><script nonce="n1"></script>',
    ])
  })

  it('leaves a script\'s contents and comments as they are', () => {
    // `<script` inside a script's text and inside a comment, around two real scripts.
    const html = ['<script>document.write("<script>")</script><!-- <script> --><style>a::after{content:"<script>"}</style><SCRIPT src="/b.js"></SCRIPT>']
    expect(addNonce(html, 'n1')).toEqual([
      '<script nonce="n1">document.write("<script>")</script><!-- <script> --><style>a::after{content:"<script>"}</style><script nonce="n1" src="/b.js"></SCRIPT>',
    ])
  })

  it('copies text, a lone `<` and an unclosed tag as they are', () => {
    // Text with a `<` that starts no tag, and a chunk cut off inside a tag.
    expect(addNonce(['a < b <3', '<meta content="x'], 'n1')).toEqual(['a < b <3', '<meta content="x'])
  })
})
