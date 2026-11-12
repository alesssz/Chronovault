import type { TablesInsert, TablesUpdate } from '~~/shared/types/database.types'
import type { DbClient } from '../utils/auth'
import { toHttpError } from '../utils/errors'
import { readAllPages } from './pages'
import { TRACK_METADATA_COLUMNS, TRACK_SUMMARY_COLUMNS, type TrackMetadataRow, type TrackRow, type TrackSummaryRow } from '../mappers/track'

/**
 * Access to the `tracks` table. RLS already limits every user to their own
 * rows; every query also filters on `user_id` as a second line of defense.
 * Other people's tracks are only reachable through sharing.repository.
 *
 * Repositories only run queries and translate database errors into HTTP
 * errors (`toHttpError`); business rules live in the services.
 */

/** The user's whole library, newest first (summary columns only: no lyrics or peaks), read in pages. */
export async function listTrackRows(db: DbClient, userId: string): Promise<TrackSummaryRow[]> {
  return readAllPages((from, to) => db
    .from('tracks')
    .select(TRACK_SUMMARY_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    // Tracks uploaded together can share a timestamp: the id makes the order (and the pages) stable.
    .order('id')
    .range(from, to)
    // The column list is a runtime string: tell the typed client what it returns.
    .overrideTypes<TrackSummaryRow[], { merge: false }>(), 'tracks.list')
}

/** Every editable field of every track of the user (the metadata export and import), read in pages: a library can pass 1000 tracks. */
export async function listTrackMetadataRows(db: DbClient, userId: string): Promise<TrackMetadataRow[]> {
  return readAllPages((from, to) => db
    .from('tracks')
    .select(TRACK_METADATA_COLUMNS)
    .eq('user_id', userId)
    .order('id')
    .range(from, to)
    // The column list is a runtime string: tell the typed client what it returns.
    .overrideTypes<TrackMetadataRow[], { merge: false }>(), 'tracks.listMetadata')
}

/** What the Statistics page shows of a track (and needs for its cover address). */
export type TrackLabelRow = Pick<TrackRow, 'id' | 'title' | 'visibility' | 'cover_path' | 'updated_at'>

/** Title, visibility and cover of every track of the user (Statistics page). */
export async function listTrackLabels(db: DbClient, userId: string): Promise<TrackLabelRow[]> {
  return readAllPages((from, to) => db
    .from('tracks')
    .select('id, title, visibility, cover_path, updated_at')
    .eq('user_id', userId)
    .order('id')
    .range(from, to), 'tracks.listLabels')
}

/** One full row, or null when it does not exist or belongs to someone else. */
export async function findTrackRow(db: DbClient, userId: string, id: string): Promise<TrackRow | null> {
  // At most one row (the id is the key); none when missing or not the user's.
  const { data, error } = await db.from('tracks').select('*').eq('id', id).eq('user_id', userId).maybeSingle()
  if (error) throw toHttpError(error, 'tracks.find')
  return data
}

/** Lightweight query for the player: only the audio file path. */
export async function findTrackAudioPath(db: DbClient, userId: string, id: string): Promise<string | null> {
  // Only the column the player needs.
  const { data, error } = await db.from('tracks').select('audio_path').eq('id', id).eq('user_id', userId).maybeSingle()
  if (error) throw toHttpError(error, 'tracks.findAudioPath')
  return data?.audio_path ?? null
}

/** Cover path of one of the user's tracks (null: no cover, or not the user's track). */
export async function findTrackCoverPath(db: DbClient, userId: string, id: string): Promise<string | null> {
  // Only the cover path.
  const { data, error } = await db.from('tracks').select('cover_path').eq('id', id).eq('user_id', userId).maybeSingle()
  if (error) throw toHttpError(error, 'tracks.findCoverPath')
  return data?.cover_path ?? null
}

/**
 * Storage paths of every file the user's tracks use (storage clean-up). All
 * of them, read in pages: a path missing here would make its file look
 * orphaned, and the clean-up would delete a track's audio.
 */
export async function listTrackFilePaths(
  db: DbClient,
  userId: string,
): Promise<Pick<TrackRow, 'audio_path' | 'cover_path'>[]> {
  return readAllPages((from, to) => db
    .from('tracks')
    .select('audio_path, cover_path')
    .eq('user_id', userId)
    .order('id')
    .range(from, to), 'tracks.listFilePaths')
}

/** Inserts a track and returns the stored row (with defaults and generated columns). */
export async function insertTrackRow(db: DbClient, row: TablesInsert<'tracks'>): Promise<TrackRow> {
  // The new row, read back with its defaults and generated columns.
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
  // The updated row, or none when nothing matched (missing, or someone else's).
  const { data, error } = await db.from('tracks').update(patch).eq('id', id).eq('user_id', userId).select('*').maybeSingle()
  if (error) throw toHttpError(error, 'tracks.update')
  return data
}

/**
 * Moves one of the user's tracks to a new audio file (the editor's Replace
 * audio), only if it still names `currentPath`: when another replace got
 * there first, nothing is updated and null comes back, so the caller knows
 * its new file is not the one in use. Null too when the track does not exist
 * or is not the user's (the caller has read it just before).
 */
export async function swapTrackAudioRow(
  db: DbClient,
  userId: string,
  id: string,
  currentPath: string,
  patch: TablesUpdate<'tracks'>,
): Promise<TrackRow | null> {
  // The updated row, or none when the path moved meanwhile (or the track is gone).
  const { data, error } = await db
    .from('tracks')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .eq('audio_path', currentPath)
    .select('*')
    .maybeSingle()
  if (error) throw toHttpError(error, 'tracks.swapAudio')
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
  // The deleted row's file paths (the caller removes the files), or none when nothing matched.
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
