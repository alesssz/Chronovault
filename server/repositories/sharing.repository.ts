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
  const { data, error } = await db.rpc('get_shared_track', { p_track_id: id }).maybeSingle()
  if (error) throw toHttpError(error, 'sharedTracks.find')
  return data
}

/** A non-private playlist (null for private or missing ones). */
export async function findSharedPlaylistRow(db: DbClient, id: string): Promise<SharedPlaylistRow | null> {
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
  const { data, error } = await db.rpc('get_shared_playlist_tracks', { p_playlist_id: id })
  if (error) throw toHttpError(error, 'sharedPlaylists.tracks')
  return [...data].sort(byPosition)
}
