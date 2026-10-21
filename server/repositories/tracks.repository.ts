import type { TablesInsert, TablesUpdate } from '~~/shared/types/database.types'
import type { DbClient } from '../utils/auth'
import { toHttpError } from '../utils/errors'
import { TRACK_SUMMARY_COLUMNS, type TrackRow, type TrackSummaryRow } from '../mappers/track'

/**
 * Access to the `tracks` table. RLS already limits every user to their own
 * rows; every query also filters on `user_id` as a second line of defense.
 * Other people's tracks are only reachable through sharing.repository.
 *
 * Repositories only run queries and translate database errors into HTTP
 * errors (`toHttpError`); business rules live in the services.
 */

/** The user's library, newest first (summary columns only: no lyrics or peaks). */
export async function listTrackRows(db: DbClient, userId: string): Promise<TrackSummaryRow[]> {
  const { data, error } = await db
    .from('tracks')
    .select(TRACK_SUMMARY_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    // The column list is a runtime string: tell the typed client what it returns.
    .overrideTypes<TrackSummaryRow[], { merge: false }>()
  if (error) throw toHttpError(error, 'tracks.list')
  return data
}

/** One full row, or null when it does not exist or belongs to someone else. */
export async function findTrackRow(db: DbClient, userId: string, id: string): Promise<TrackRow | null> {
  const { data, error } = await db.from('tracks').select('*').eq('id', id).eq('user_id', userId).maybeSingle()
  if (error) throw toHttpError(error, 'tracks.find')
  return data
}

/** Lightweight query for the player: only the audio file path. */
export async function findTrackAudioPath(db: DbClient, userId: string, id: string): Promise<string | null> {
  const { data, error } = await db.from('tracks').select('audio_path').eq('id', id).eq('user_id', userId).maybeSingle()
  if (error) throw toHttpError(error, 'tracks.findAudioPath')
  return data?.audio_path ?? null
}

/** Storage paths of every file the user's tracks use (storage clean-up). */
export async function listTrackFilePaths(
  db: DbClient,
  userId: string,
): Promise<Pick<TrackRow, 'audio_path' | 'cover_path'>[]> {
  const { data, error } = await db.from('tracks').select('audio_path, cover_path').eq('user_id', userId)
  if (error) throw toHttpError(error, 'tracks.listFilePaths')
  return data
}

/** Inserts a track and returns the stored row (with defaults and generated columns). */
export async function insertTrackRow(db: DbClient, row: TablesInsert<'tracks'>): Promise<TrackRow> {
  const { data, error } = await db.from('tracks').insert(row).select('*').single()
  if (error) throw toHttpError(error, 'tracks.insert')
  return data
}

/** Applies a partial update; null when the track does not exist (or is not the user's). */
export async function updateTrackRow(
  db: DbClient,
  userId: string,
  id: string,
  patch: TablesUpdate<'tracks'>,
): Promise<TrackRow | null> {
  const { data, error } = await db.from('tracks').update(patch).eq('id', id).eq('user_id', userId).select('*').maybeSingle()
  if (error) throw toHttpError(error, 'tracks.update')
  return data
}

/**
 * Deletes the track and returns the file paths to remove from storage
 * (null when nothing was deleted). Playlist entries go away with it
 * (`on delete cascade`).
 */
export async function deleteTrackRow(
  db: DbClient,
  userId: string,
  id: string,
): Promise<Pick<TrackRow, 'audio_path' | 'cover_path'> | null> {
  const { data, error } = await db
    .from('tracks')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('audio_path, cover_path')
    .maybeSingle()
  if (error) throw toHttpError(error, 'tracks.delete')
  return data
}
