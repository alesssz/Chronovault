import { createError } from 'h3'
import { AudioStorage, type AudioStorageConfig } from '../repositories/audio-storage'

let cached: { key: string, storage: AudioStorage } | null = null

/**
 * The audio storage configured through runtime config
 * (`NUXT_AUDIO_STORAGE_*` environment variables, see README → Environment variables).
 */
export function useAudioStorage(): AudioStorage {
  const config = useRuntimeConfig().audioStorage as AudioStorageConfig
  const missing = (['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey'] as const).filter(k => !config[k])
  if (missing.length) {
    console.error(`[audio-storage] missing configuration: ${missing.join(', ')}`)
    throw createError({ statusCode: 500, message: 'Audio storage is not configured' })
  }
  const key = JSON.stringify(config)
  if (cached?.key !== key) cached = { key, storage: new AudioStorage(config) }
  return cached.storage
}
