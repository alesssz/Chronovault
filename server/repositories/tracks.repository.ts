import type { TablesInsert, TablesUpdate } from '~~/shared/types/database.types'
import type { DbClient } from '../utils/auth'
import { toHttpError } from '../utils/errors'
import { TRACK_SUMMARY_COLUMNS, type TrackRow, type TrackSummaryRow } from '../mappers/track'

/**
 * Access to the `tracks` table. Every query also filters on `user_id`:
 * RLS would expose other users' public tracks as well, while the library
 * must only show the user's own.
 */

export async function listTrackRows(db: DbClient, userId: string): Promise<TrackSummaryRow[]> {
  const { data, error } = await db
    .from('tracks')
    .select(TRACK_SUMMARY_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .overrideTypes<TrackSummaryRow[], { merge: false }>()
  if (error) throw toHttpError(error, 'tracks.list')
  return data
}

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

export async function insertTrackRow(db: DbClient, row: TablesInsert<'tracks'>): Promise<TrackRow> {
  const { data, error } = await db.from('tracks').insert(row).select('*').single()
  if (error) throw toHttpError(error, 'tracks.insert')
  return data
}

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

/** Deletes the track and returns the file paths to remove from storage. */
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
