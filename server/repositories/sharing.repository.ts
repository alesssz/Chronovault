import type { DbClient } from '../utils/auth'
import { toHttpError } from '../utils/errors'
import type { SharedTrackRow } from '../mappers/track'
import type { SharedPlaylistRow, SharedPlaylistTrackRow } from '../mappers/playlist'
import { byPosition } from './playlists.repository'

/**
 * Tracks and playlists shared by link ('unlisted' and 'public'), for anyone,
 * signed in or not. Goes through the get_shared_*() database functions: they
 * never return private items, nor the fields that are never shared.
 *
 * Those functions are `security definer` (they bypass RLS), which is why the
 * filtering lives in SQL (supabase/migrations/…_public_sharing.sql and
 * …_playlists.sql) and is covered by the pgTAP tests, not in this file.
 */

/** A non-private track (null for private or missing ones: the two are indistinguishable). */
export async function findSharedTrackRow(db: DbClient, id: string): Promise<SharedTrackRow | null> {
  // One row, or none: private and missing tracks look the same from here.
  const { data, error } = await db.rpc('get_shared_track', { p_track_id: id }).maybeSingle()
  if (error) throw toHttpError(error, 'sharedTracks.find')
  return data
}

/** A non-private playlist (null for private or missing ones). */
export async function findSharedPlaylistRow(db: DbClient, id: string): Promise<SharedPlaylistRow | null> {
  // One row, or none for a private or missing playlist.
  const { data, error } = await db.rpc('get_shared_playlist', { p_playlist_id: id }).maybeSingle()
  if (error) throw toHttpError(error, 'sharedPlaylists.find')
  return data
}

/**
 * All the tracks of a non-private playlist, in order (empty for private ones).
 * The SQL already orders by position; sorting again keeps the contract even
 * if PostgREST ever returns the rows differently.
 */
export async function listSharedPlaylistTrackRows(db: DbClient, id: string): Promise<SharedPlaylistTrackRow[]> {
  // Every track of the playlist (few: no paging needed, a playlist is never thousands of tracks long).
  const { data, error } = await db.rpc('get_shared_playlist_tracks', { p_playlist_id: id })
  if (error) throw toHttpError(error, 'sharedPlaylists.tracks')
  return [...data].sort(byPosition)
}

/**
 * The audio file of one track of a shared playlist; null when the playlist is
 * private or missing, or the track is not in it. One path, for the player's
 * every change of track, instead of the whole list with its lyrics and peaks.
 */
export async function findSharedPlaylistTrackAudio(db: DbClient, playlistId: string, trackId: string): Promise<string | null> {
  const { data, error } = await db.rpc('get_shared_playlist_track_audio', { p_playlist_id: playlistId, p_track_id: trackId })
  if (error) throw toHttpError(error, 'sharedPlaylists.trackAudio')
  return data ?? null
}

/**
 * The cover a shared playlist shows: its own, otherwise the first track's that
 * has one, in order (the mosaic's first tile); null when there is none or the
 * playlist is not shared. One path, instead of the whole list.
 */
export async function findSharedPlaylistCover(db: DbClient, id: string): Promise<string | null> {
  const { data, error } = await db.rpc('get_shared_playlist_cover', { p_playlist_id: id })
  if (error) throw toHttpError(error, 'sharedPlaylists.cover')
  return data ?? null
}
