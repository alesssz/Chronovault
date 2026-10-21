import type { TablesInsert, TablesUpdate } from '~~/shared/types/database.types'
import type { DbClient } from '../utils/auth'
import { toHttpError } from '../utils/errors'
import { TRACK_SUMMARY_COLUMNS, type TrackSummaryRow } from '../mappers/track'
import type { PlaylistRow, PlaylistTrackStatsRow } from '../mappers/playlist'

/**
 * Access to the `playlists` and `playlist_tracks` tables. RLS limits every
 * user to their own playlists; queries also filter on `user_id`.
 */

interface PlaylistEntry<T> {
  position: number
  tracks: T | null
}

export type PlaylistListRow = PlaylistRow & { playlist_tracks: PlaylistEntry<PlaylistTrackStatsRow>[] }
export type PlaylistDetailRow = PlaylistRow & { playlist_tracks: PlaylistEntry<TrackSummaryRow>[] }

/** The tracks of a playlist row, in playlist order. */
export function orderedTracks<T>(entries: PlaylistEntry<T>[]): T[] {
  return [...entries].sort((a, b) => a.position - b.position).flatMap(e => (e.tracks ? [e.tracks] : []))
}

export async function listPlaylistRows(db: DbClient, userId: string): Promise<PlaylistListRow[]> {
  const { data, error } = await db
    .from('playlists')
    .select('*, playlist_tracks(position, tracks(cover_path, duration_seconds, visibility))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .overrideTypes<PlaylistListRow[], { merge: false }>()
  if (error) throw toHttpError(error, 'playlists.list')
  return data
}

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
  return [...data.playlist_tracks].sort((a, b) => a.position - b.position).map(e => e.track_id)
}

export async function insertPlaylistRow(db: DbClient, row: TablesInsert<'playlists'>): Promise<PlaylistRow> {
  const { data, error } = await db.from('playlists').insert(row).select('*').single()
  if (error) throw toHttpError(error, 'playlists.insert')
  return data
}

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

/** Replaces the tracks of a playlist, in order, in one transaction. */
export async function setPlaylistTrackIds(db: DbClient, id: string, trackIds: string[]): Promise<void> {
  const { error } = await db.rpc('set_playlist_tracks', { p_playlist_id: id, p_track_ids: trackIds })
  if (error) throw toHttpError(error, 'playlists.setTracks')
}
