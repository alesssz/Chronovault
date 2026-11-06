/**
 * The audio storage settings shared by `pnpm r2:check` and `pnpm flac:seektable --env`
 * (scripts/lib/storage-env.mjs): placeholders such as Vercel's "[SENSITIVE]" and empty values
 * are named before any request (they reached the signing library as an address "[SENSITIVE]/…"
 * and failed with a bare "Invalid URL"), as is an endpoint that is no URL.
 */
import { describe, expect, it } from 'vitest'
import { isPlaceholder, storageConfig } from '../../../scripts/lib/storage-env.mjs'

/** A complete, valid set of values. */
const VALID = {
  NUXT_AUDIO_STORAGE_ENDPOINT: 'https://abc123.r2.cloudflarestorage.com/',
  NUXT_AUDIO_STORAGE_REGION: 'auto',
  NUXT_AUDIO_STORAGE_BUCKET: 'chronovault-audio',
  NUXT_AUDIO_STORAGE_ACCESS_KEY_ID: 'key-id',
  NUXT_AUDIO_STORAGE_SECRET_ACCESS_KEY: 'secret',
}

describe('isPlaceholder', () => {
  it('recognizes a value in square brackets, as Vercel writes hidden ones', () => {
    expect(isPlaceholder('[SENSITIVE]')).toBe(true)
    expect(isPlaceholder(' [REDACTED] ')).toBe(true)
    expect(isPlaceholder('chronovault-audio')).toBe(false)
    expect(isPlaceholder(undefined)).toBe(false)
  })
})

describe('storageConfig', () => {
  it('builds the configuration from complete values (endpoint without its trailing slash)', () => {
    expect(storageConfig(VALID)).toEqual({
      config: {
        endpoint: 'https://abc123.r2.cloudflarestorage.com',
        region: 'auto',
        bucket: 'chronovault-audio',
        accessKeyId: 'key-id',
        secretAccessKey: 'secret',
      },
      problems: [],
    })
  })

  it('defaults the region to R2\'s "auto"', () => {
    expect(storageConfig({ ...VALID, NUXT_AUDIO_STORAGE_REGION: '' }).config.region).toBe('auto')
  })

  it('names every placeholder and empty value, and never uses them', () => {
    const { config, problems } = storageConfig({
      ...VALID,
      NUXT_AUDIO_STORAGE_ENDPOINT: '[SENSITIVE]',
      NUXT_AUDIO_STORAGE_BUCKET: '[SENSITIVE]',
      NUXT_AUDIO_STORAGE_SECRET_ACCESS_KEY: '',
    })
    expect(config.endpoint).toBeUndefined()
    expect(config.bucket).toBeUndefined()
    expect(problems).toEqual([
      'NUXT_AUDIO_STORAGE_ENDPOINT is a placeholder ([SENSITIVE]), not its value',
      'NUXT_AUDIO_STORAGE_BUCKET is a placeholder ([SENSITIVE]), not its value',
      'NUXT_AUDIO_STORAGE_SECRET_ACCESS_KEY is empty',
    ])
  })

  it('refuses an endpoint that is not an http(s) address', () => {
    expect(storageConfig({ ...VALID, NUXT_AUDIO_STORAGE_ENDPOINT: 'abc123.r2.cloudflarestorage.com' }).problems)
      .toEqual(['NUXT_AUDIO_STORAGE_ENDPOINT is not an http(s) address'])
  })
})
