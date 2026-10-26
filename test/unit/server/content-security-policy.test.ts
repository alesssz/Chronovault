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
  })

  it('lists each origin of a deployment with Supabase Cloud and R2', () => {
    // A deployment's policy, split into directives.
    const d = directivesOf(contentSecurityPolicy('n', {
      supabaseUrl: 'https://xyz.supabase.co',
      audioEndpoint: 'https://abc.r2.cloudflarestorage.com',
    }))
    expect(d['connect-src']).toEqual(['\'self\'', 'https://xyz.supabase.co', 'https://abc.r2.cloudflarestorage.com'])
    expect(d['media-src']).toEqual(['\'self\'', 'blob:', 'https://abc.r2.cloudflarestorage.com'])
  })

  it('leaves out a missing setting instead of writing an invalid source', () => {
    // A policy without any configured backend.
    const policy = contentSecurityPolicy('n', { supabaseUrl: '', audioEndpoint: '' })
    expect(directivesOf(policy)['connect-src']).toEqual(['\'self\''])
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
})
