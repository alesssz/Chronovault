import type { PlaybackSource, SharedTrack } from '~~/shared/types/track'
import type { SharedPlaylist } from '~~/shared/types/playlist'
import { COVERS_BUCKET } from '~~/shared/utils/storage-paths'
import type { DbClient } from '../utils/auth'
import { notFound } from '../utils/errors'
import { toSharedTrack } from '../mappers/track'
import { mosaicPaths, toSharedPlaylist, type SignedUrls } from '../mappers/playlist'
import type { AudioStorage } from '../repositories/audio-storage'
import { findSharedPlaylistRow, findSharedTrackRow, listSharedPlaylistTrackRows } from '../repositories/sharing.repository'
import * as storageRepo from '../repositories/storage.repository'

/**
 * Public sharing: what anyone with the link of an 'unlisted' or 'public'
 * track or playlist can see and play. A private item answers exactly like a
 * missing one (404), so its existence is never revealed.
 *
 * A shared playlist shares all its tracks, private ones included, but only
 * through the playlist: their audio is signed via the playlist's id.
 */

/** Public data of an unlisted/public track, with a signed cover. */
export async function getSharedTrack(db: DbClient, id: string): Promise<SharedTrack> {
  const row = await findSharedTrackRow(db, id)
  if (!row) throw notFound()
  return toSharedTrack(row, await signCover(db, row.cover_path))
}

/** Streaming URL of an unlisted/public track (presigned GET, 6 h). */
export async function getSharedPlaybackSource(db: DbClient, audio: AudioStorage, id: string): Promise<PlaybackSource> {
  const row = await findSharedTrackRow(db, id)
  if (!row) throw notFound()
  return presignAudio(audio, row.audio_path)
}

/** Fresh signed URL of the cover: social previews link to a stable address that redirects here. */
export async function getSharedCoverUrl(db: DbClient, id: string): Promise<string> {
  const row = await findSharedTrackRow(db, id)
  const url = row ? await signCover(db, row.cover_path) : null
  if (!url) throw notFound('Cover not found')
  return url
}

// --- Playlists --------------------------------------------------------------------

const playlistNotFound = () => notFound('Playlist not found')

/** Public data of an unlisted/public playlist and all its tracks, covers signed in one request. */
export async function getSharedPlaylist(db: DbClient, id: string): Promise<SharedPlaylist> {
  const row = await findSharedPlaylistRow(db, id)
  if (!row) throw playlistNotFound()
  const tracks = await listSharedPlaylistTrackRows(db, id)
  const signed = await signCovers(db, [row.cover_path, ...tracks.map(t => t.cover_path)])
  return toSharedPlaylist(row, tracks, signed)
}

/**
 * Signed streaming URL of a track, only when it belongs to the shared
 * playlist. This is what makes a private track audible through a shared
 * playlist and nowhere else: its id alone (`/api/shared/:id/playback`) still 404s.
 */
export async function getSharedPlaylistPlaybackSource(
  db: DbClient,
  audio: AudioStorage,
  playlistId: string,
  trackId: string,
): Promise<PlaybackSource> {
  // Only a track listed by the shared playlist can be signed through it.
  const track = (await listSharedPlaylistTrackRows(db, playlistId)).find(t => t.id === trackId)
  if (!track) throw notFound()
  return presignAudio(audio, track.audio_path)
}

/** Fresh signed URL of the playlist's cover: the custom one, otherwise the first track cover. */
export async function getSharedPlaylistCoverUrl(db: DbClient, id: string): Promise<string> {
  const row = await findSharedPlaylistRow(db, id)
  if (!row) throw playlistNotFound()
  const path = row.cover_path ?? mosaicPaths(await listSharedPlaylistTrackRows(db, id))[0] ?? null
  const url = await signCover(db, path)
  if (!url) throw notFound('Cover not found')
  return url
}

// --- Helpers ----------------------------------------------------------------------

/** Presigned GET on the audio storage, with its expiry. */
async function presignAudio(audio: AudioStorage, path: string): Promise<PlaybackSource> {
  return {
    url: await audio.presign('GET', path, storageRepo.SIGNED_URL_TTL),
    expiresAt: new Date(Date.now() + storageRepo.SIGNED_URL_TTL * 1000).toISOString(),
  }
}

/** Signs a set of cover paths in one request and returns a lookup function. */
async function signCovers(db: DbClient, paths: (string | null)[]): Promise<SignedUrls> {
  // Each path once, nulls dropped (tracks without covers).
  const unique = [...new Set(paths.filter((p): p is string => !!p))]
  const urls = await storageRepo.createSignedUrls(db, COVERS_BUCKET, unique)
  return path => (path ? urls.get(path) ?? null : null)
}

/** Signed cover URL, or null when there is no cover or it cannot be signed. */
async function signCover(db: DbClient, path: string | null): Promise<string | null> {
  if (!path) return null
  try {
    return await storageRepo.createSignedUrl(db, COVERS_BUCKET, path)
  }
  catch {
    return null
  }
}
