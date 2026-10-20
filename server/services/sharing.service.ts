import type { PlaybackSource, SharedTrack } from '~~/shared/types/track'
import { COVERS_BUCKET } from '~~/shared/utils/storage-paths'
import type { DbClient } from '../utils/auth'
import { notFound } from '../utils/errors'
import { toSharedTrack } from '../mappers/track'
import type { AudioStorage } from '../repositories/audio-storage'
import { findSharedTrackRow } from '../repositories/shared-tracks.repository'
import * as storageRepo from '../repositories/storage.repository'

/**
 * Public sharing: what anyone with the link of an 'unlisted' or 'public'
 * track can see and play. A private track answers exactly like a missing
 * one (404), so its existence is never revealed.
 */

export async function getSharedTrack(db: DbClient, id: string): Promise<SharedTrack> {
  const row = await findSharedTrackRow(db, id)
  if (!row) throw notFound()
  return toSharedTrack(row, await signCover(db, row.cover_path))
}

export async function getSharedPlaybackSource(db: DbClient, audio: AudioStorage, id: string): Promise<PlaybackSource> {
  const row = await findSharedTrackRow(db, id)
  if (!row) throw notFound()
  return {
    url: await audio.presign('GET', row.audio_path, storageRepo.SIGNED_URL_TTL),
    expiresAt: new Date(Date.now() + storageRepo.SIGNED_URL_TTL * 1000).toISOString(),
  }
}

/** Fresh signed URL of the cover: social previews link to a stable address that redirects here. */
export async function getSharedCoverUrl(db: DbClient, id: string): Promise<string> {
  const row = await findSharedTrackRow(db, id)
  const url = row ? await signCover(db, row.cover_path) : null
  if (!url) throw notFound('Cover not found')
  return url
}

async function signCover(db: DbClient, path: string | null): Promise<string | null> {
  if (!path) return null
  try {
    return await storageRepo.createSignedUrl(db, COVERS_BUCKET, path)
  }
  catch {
    return null
  }
}
