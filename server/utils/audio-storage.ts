import { createError } from 'h3'
import { AudioStorage, type AudioStorageConfig } from '../repositories/audio-storage'

/**
 * One AudioStorage instance per configuration, reused across requests
 * (the signing client is cheap but needs not be rebuilt every time).
 * The cache key changes only if the runtime config changes (e.g. in tests).
 */
let cached: { key: string, storage: AudioStorage } | null = null

/**
 * The audio storage configured through runtime config
 * (`NUXT_AUDIO_STORAGE_*` environment variables, see docs/10-configuration.md, 10.1 Environment variables).
 *
 * A missing setting is a deployment mistake: it is logged by name and the
 * request fails with a generic 500, so secrets never reach the response.
 */
export function useAudioStorage(): AudioStorage {
  // runtimeConfig.audioStorage, filled from NUXT_AUDIO_STORAGE_* at startup.
  const config = useRuntimeConfig().audioStorage as AudioStorageConfig
  // `region` is not checked: it defaults to `auto` (R2).
  const missing = (['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey'] as const).filter(k => !config[k])
  if (missing.length) {
    console.error(`[audio-storage] missing configuration: ${missing.join(', ')}`)
    throw createError({ statusCode: 500, message: 'Audio storage is not configured' })
  }
  // The whole configuration as the cache key: any change gets a new client.
  const key = JSON.stringify(config)
  if (cached?.key !== key) cached = { key, storage: new AudioStorage(config) }
  return cached.storage
}
