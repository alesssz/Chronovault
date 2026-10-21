import type { DbClient } from '../utils/auth'
import { toHttpError } from '../utils/errors'
import type { SharedTrackRow } from '../mappers/track'
import type { SharedPlaylistRow, SharedPlaylistTrackRow } from '../mappers/playlist'

/**
 * Tracks and playlists shared by link ('unlisted' and 'public'), for anyone,
 * signed in or not. Goes through the get_shared_*() database functions: they
 * never return private items, nor the fields that are never shared.
 */
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

/** All the tracks of a non-private playlist, in order (empty for private ones). */
export async function listSharedPlaylistTrackRows(db: DbClient, id: string): Promise<SharedPlaylistTrackRow[]> {
  const { data, error } = await db.rpc('get_shared_playlist_tracks', { p_playlist_id: id })
  if (error) throw toHttpError(error, 'sharedPlaylists.tracks')
  return [...data].sort((a, b) => a.position - b.position)
}
