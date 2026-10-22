import type { TablesInsert, TablesUpdate } from '~~/shared/types/database.types'
import type { DbClient } from '../utils/auth'
import { toHttpError } from '../utils/errors'
import { TRACK_SUMMARY_COLUMNS, type TrackSummaryRow } from '../mappers/track'
import type { PlaylistRow, PlaylistTrackStatsRow } from '../mappers/playlist'

/**
 * Access to the `playlists` and `playlist_tracks` tables. RLS limits every
 * user to their own playlists; queries also filter on `user_id`.
 *
 * Tracks are read through PostgREST resource embedding
 * (`playlists → playlist_tracks → tracks`): one HTTP request returns a
 * playlist with all its tracks.
 */

/** One embedded `playlist_tracks` row with its embedded track. */
interface PlaylistEntry<T> {
  position: number
  /** null only if RLS hid the track (it cannot happen for the owner, but the type allows it). */
  tracks: T | null
}

/** A playlist row with just enough track data for the list (count, duration, mosaic). */
export type PlaylistListRow = PlaylistRow & { playlist_tracks: PlaylistEntry<PlaylistTrackStatsRow>[] }
/** A playlist row with the summary of every track. */
export type PlaylistDetailRow = PlaylistRow & { playlist_tracks: PlaylistEntry<TrackSummaryRow>[] }

/** Comparator for playlist rows: ascending `position` (embedded and RPC rows have no guaranteed order). */
export function byPosition(a: { position: number }, b: { position: number }): number {
  return a.position - b.position
}

/** The tracks of a playlist row, in playlist order (embedded rows come back unordered). */
export function orderedTracks<T>(entries: PlaylistEntry<T>[]): T[] {
  return [...entries].sort(byPosition).flatMap(e => (e.tracks ? [e.tracks] : []))
}

/** The user's playlists, newest first. */
export async function listPlaylistRows(db: DbClient, userId: string): Promise<PlaylistListRow[]> {
  const { data, error } = await db
    .from('playlists')
    // Track id and updated_at build the mosaic's cover addresses.
    .select('*, playlist_tracks(position, tracks(id, cover_path, duration_seconds, visibility, updated_at))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .overrideTypes<PlaylistListRow[], { merge: false }>()
  if (error) throw toHttpError(error, 'playlists.list')
  return data
}

/** One playlist with its tracks, or null when it does not exist or is not the user's. */
export async function findPlaylistRow(db: DbClient, userId: string, id: string): Promise<PlaylistDetailRow | null> {
  const { data, error } = await db
    .from('playlists')
    .select(`*, playlist_tracks(position, tracks(${TRACK_SUMMARY_COLUMNS}))`)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
    .overrideTypes<PlaylistDetailRow | null, { merge: false }>()
  if (error) throw toHttpError(error, 'playlists.find')
  return data
}

/** Track ids of a playlist, in order (null when the playlist does not exist). */
export async function findPlaylistTrackIds(db: DbClient, userId: string, id: string): Promise<string[] | null> {
  const { data, error } = await db
    .from('playlists')
    .select('id, playlist_tracks(position, track_id)')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw toHttpError(error, 'playlists.findTrackIds')
  if (!data) return null
  return [...data.playlist_tracks].sort(byPosition).map(e => e.track_id)
}

/** What the Statistics page shows of a playlist (and needs for its cover address). */
export type PlaylistLabelRow = Pick<PlaylistRow, 'id' | 'title' | 'visibility' | 'cover_path' | 'updated_at'>

/** Title, visibility and custom cover of every playlist of the user (Statistics page). */
export async function listPlaylistLabels(db: DbClient, userId: string): Promise<PlaylistLabelRow[]> {
  const { data, error } = await db.from('playlists').select('id, title, visibility, cover_path, updated_at').eq('user_id', userId)
  if (error) throw toHttpError(error, 'playlists.listLabels')
  return data
}

/** Custom cover path of one of the user's playlists (null: none, or not the user's playlist). */
export async function findPlaylistCoverPath(db: DbClient, userId: string, id: string): Promise<string | null> {
  const { data, error } = await db.from('playlists').select('cover_path').eq('id', id).eq('user_id', userId).maybeSingle()
  if (error) throw toHttpError(error, 'playlists.findCoverPath')
  return data?.cover_path ?? null
}

/** Custom cover paths of the user's playlists (storage clean-up). */
export async function listPlaylistCoverPaths(db: DbClient, userId: string): Promise<string[]> {
  const { data, error } = await db.from('playlists').select('cover_path').eq('user_id', userId).not('cover_path', 'is', null)
  if (error) throw toHttpError(error, 'playlists.listCoverPaths')
  return data.flatMap(row => (row.cover_path ? [row.cover_path] : []))
}

/** Inserts a playlist (no tracks yet) and returns the stored row. */
export async function insertPlaylistRow(db: DbClient, row: TablesInsert<'playlists'>): Promise<PlaylistRow> {
  const { data, error } = await db.from('playlists').insert(row).select('*').single()
  if (error) throw toHttpError(error, 'playlists.insert')
  return data
}

/** Applies a partial update; null when the playlist does not exist (or is not the user's). */
export async function updatePlaylistRow(
  db: DbClient,
  userId: string,
  id: string,
  patch: TablesUpdate<'playlists'>,
): Promise<PlaylistRow | null> {
  const { data, error } = await db.from('playlists').update(patch).eq('id', id).eq('user_id', userId).select('*').maybeSingle()
  if (error) throw toHttpError(error, 'playlists.update')
  return data
}

/** Deletes the playlist (its tracks stay in the library) and returns its custom cover path. */
export async function deletePlaylistRow(
  db: DbClient,
  userId: string,
  id: string,
): Promise<Pick<PlaylistRow, 'cover_path'> | null> {
  const { data, error } = await db
    .from('playlists')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('cover_path')
    .maybeSingle()
  if (error) throw toHttpError(error, 'playlists.delete')
  return data
}

/**
 * Replaces the tracks of a playlist, in order, in one transaction
 * (the `set_playlist_tracks` database function). It runs with the caller's
 * rights: RLS refuses other users' playlists (404) and tracks (403).
 */
export async function setPlaylistTrackIds(db: DbClient, id: string, trackIds: string[]): Promise<void> {
  const { error } = await db.rpc('set_playlist_tracks', { p_playlist_id: id, p_track_ids: trackIds })
  if (error) throw toHttpError(error, 'playlists.setTracks')
}
