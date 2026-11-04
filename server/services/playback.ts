import type { PlaybackSource } from '~~/shared/types/track'
import { COVERS_BUCKET } from '~~/shared/utils/storage-paths'
import type { DbClient } from '../utils/auth'
import type { AudioStorage } from '../repositories/audio-storage'
import * as storageRepo from '../repositories/storage.repository'

/**
 * Small storage steps shared by the services: the streaming address of an
 * audio file (owner's library and public pages alike) and removing cover
 * files.
 */

/** ISO timestamp `seconds` from now (expiry of a presigned URL). */
export function expiresIn(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString()
}

/**
 * Streaming address of an audio file, valid for SIGNED_URL_TTL (6 h), with
 * its expiry so the player can refresh it.
 *
 * It is the app's own address (`/api/stream?…`, see AudioStorage.streamUrl
 * and server/api/stream.ts), not a presigned storage URL: it answers a HEAD
 * request (a presigned GET refuses it), which a cast device may send, and
 * redirects the actual download to a presigned GET, so the audio still comes
 * straight from the storage.
 */
export async function playbackSource(audio: AudioStorage, audioPath: string): Promise<PlaybackSource> {
  return {
    url: await audio.streamUrl(audioPath, storageRepo.SIGNED_URL_TTL),
    expiresAt: expiresIn(storageRepo.SIGNED_URL_TTL),
  }
}

/**
 * Deletes cover files (best effort, see removeObjects); empty paths (items
 * without a cover) are skipped, and nothing is sent when none is left.
 */
export async function removeCoverFiles(db: DbClient, paths: (string | null | undefined)[]): Promise<void> {
  // Only the items that have a cover.
  const existing = paths.filter((path): path is string => !!path)
  if (existing.length) await storageRepo.removeObjects(db, COVERS_BUCKET, existing)
}
