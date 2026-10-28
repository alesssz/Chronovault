import type { AudioUploadTarget, PlaybackSource, TrackDetail, TrackSummary } from '~~/shared/types/track'
import type { AudioUploadRequest, TrackCreate, TrackUpdate } from '~~/shared/schemas/track'
import { MAX_AUDIO_BYTES } from '~~/shared/utils/audio-files'
import { buildAudioPath, buildCoverPath, isTrackPath } from '~~/shared/utils/storage-paths'
import type { DbClient } from '../utils/auth'
import { badRequest, conflict, isConflict, notFound } from '../utils/errors'
import { toTrackDetail, toTrackInsert, toTrackSummary, toTrackUpdate } from '../mappers/track'
import type { AudioStorage } from '../repositories/audio-storage'
import * as tracksRepo from '../repositories/tracks.repository'
import { expiresIn, playbackSource, removeCoverFiles } from './playback'

/**
 * Track business logic. Knows nothing about HTTP or Nuxt: it receives an
 * already-authenticated database client, the audio storage and the user id,
 * and returns domain types. That keeps it unit-testable with mocked
 * repositories (test/unit/server/tracks.service.test.ts).
 *
 * Audio files live on the S3-compatible audio storage (Cloudflare R2);
 * covers live in Supabase Storage.
 *
 * Upload sequence (see docs/07-data-flows.md, 7.3 Uploading a track):
 *   1. createUploadTarget → presigned PUT URL (never for an id already registered)
 *   2. the browser uploads the file straight to R2
 *   3. createTrack → checks the stored file, then inserts the row (safe to repeat)
 */

/** Lifetime of a presigned upload URL (the upload must start within it). */
export const UPLOAD_URL_TTL = 60 * 60

/**
 * The user's library. Covers need no signing: their addresses are stable
 * and served (with browser caching) by /api/covers (see mappers/cover-urls.ts).
 */
export async function listTracks(db: DbClient, userId: string): Promise<TrackSummary[]> {
  // Summary rows, newest first.
  const rows = await tracksRepo.listTrackRows(db, userId)
  return rows.map(toTrackSummary)
}

/** Full detail of one of the user's tracks (404 otherwise). */
export async function getTrack(db: DbClient, userId: string, id: string): Promise<TrackDetail> {
  // The full row (none when missing or not the user's).
  const row = await tracksRepo.findTrackRow(db, userId, id)
  if (!row) throw notFound()
  return toTrackDetail(row)
}

/**
 * Presigned URL the browser uploads the audio file to, inside the user's folder.
 * The path is built here from the user id, never taken from the client, so a
 * client cannot upload into someone else's folder. An id already registered
 * gets no upload address (409): its file must never be overwritten.
 */
export async function createUploadTarget(
  db: DbClient,
  audio: AudioStorage,
  userId: string,
  request: AudioUploadRequest,
): Promise<AudioUploadTarget> {
  if (await tracksRepo.findTrackAudioPath(db, userId, request.trackId)) {
    throw conflict('This track is already registered')
  }
  // The key the file will have: built here, from the signed-in user's id.
  const audioPath = buildAudioPath(userId, request.trackId, request.extension)
  return {
    // For this file only: its declared size and type are part of the signature.
    uploadUrl: await audio.presign('PUT', audioPath, UPLOAD_URL_TTL, { size: request.sizeBytes, contentType: request.mimeType }),
    audioPath,
    expiresAt: expiresIn(UPLOAD_URL_TTL),
  }
}

/**
 * Registers an uploaded track. Paths must point into the user's folder and
 * to this track id (the cover exactly `<userId>/<trackId>.webp`, as the
 * database requires); the file must exist with the declared size. A
 * mismatched file is deleted; so is the file when the database refuses the
 * track (no orphans), but not when the insert's outcome is unknown.
 *
 * Safe to repeat (a retry after a lost response, a double submit): a track
 * already registered with this file is returned as it is, and a registered
 * track's file is never deleted, not even when two identical requests race.
 */
export async function createTrack(
  db: DbClient,
  audio: AudioStorage,
  userId: string,
  input: TrackCreate,
): Promise<TrackDetail> {
  assertTrackPath(input.audioPath, userId, input.id, 'audio')
  if (input.coverPath) assertCoverPath(input.coverPath, userId, input.id)

  // Already registered: the same file is a repeated request (answered with the
  // track), another one a clash (409). Either way storage is left alone.
  const existing = await tracksRepo.findTrackRow(db, userId, input.id)
  if (existing) {
    if (existing.audio_path === input.audioPath) return toTrackDetail(existing)
    throw conflict('This track is already registered with another file')
  }

  // The client uploads the file straight to storage before calling the API:
  // make sure it is there, and that it is the file that was declared.
  const stored = await audio.head(input.audioPath)
  if (!stored) {
    throw badRequest('Audio file not found: finish the upload first')
  }
  if (stored.size !== input.sizeBytes || stored.size > MAX_AUDIO_BYTES) {
    await audio.remove([input.audioPath])
    throw badRequest('The uploaded file does not match the declared one')
  }

  try {
    // The stored row, with defaults and generated columns.
    const row = await tracksRepo.insertTrackRow(db, toTrackInsert(userId, input))
    return toTrackDetail(row)
  }
  catch (error) {
    // No orphaned audio when the database refused the track (a 4xx: the row was not
    // written). But a unique violation (409) means an identical request running alongside
    // registered it first, and the file is that track's now; and a 500 (a timeout, a
    // dropped connection) leaves the outcome unknown: the row may have been committed,
    // and deleting its file would leave a track that cannot play. Both keep the file; an
    // orphan left that way shows in the storage clean-up (docs 7.12).
    if (refusedByDatabase(error) && !isConflict(error)) await audio.remove([input.audioPath])
    throw error
  }
}

/**
 * Updates metadata and/or the cover. `coverPath: null` removes the cover
 * and deletes its file once the row is updated.
 */
export async function updateTrack(db: DbClient, userId: string, id: string, input: TrackUpdate): Promise<TrackDetail> {
  if (input.coverPath) assertCoverPath(input.coverPath, userId, id)

  // When the cover is removed we need the old path to delete the file.
  const previousCover = input.coverPath === null
    ? (await tracksRepo.findTrackRow(db, userId, id))?.cover_path ?? null
    : null

  // The updated row (none when missing or not the user's).
  const row = await tracksRepo.updateTrackRow(db, userId, id, toTrackUpdate(input))
  if (!row) throw notFound()

  await removeCoverFiles(db, [previousCover])
  // A new cover changes `updated_at`, hence the cover URL: browsers fetch the new image.
  return toTrackDetail(row)
}

/**
 * Deletes the row first (so the track disappears even if storage is slow),
 * then its audio and cover files, best effort.
 */
export async function deleteTrack(db: DbClient, audio: AudioStorage, userId: string, id: string): Promise<void> {
  // The deleted row's file paths (none when nothing was deleted).
  const paths = await tracksRepo.deleteTrackRow(db, userId, id)
  if (!paths) throw notFound()

  await Promise.all([
    audio.remove([paths.audio_path]),
    removeCoverFiles(db, [paths.cover_path]),
  ])
}

/** Time-limited streaming address (6 h, see playbackSource) of one of the user's tracks. */
export async function getPlaybackSource(
  db: DbClient,
  audio: AudioStorage,
  userId: string,
  id: string,
): Promise<PlaybackSource> {
  // Only the audio path (none when missing or not the user's).
  const audioPath = await tracksRepo.findTrackAudioPath(db, userId, id)
  if (!audioPath) throw notFound()
  return playbackSource(audio, audioPath)
}

/** 400 unless `path` is `<userId>/<trackId>.<ext>`: rejects paths a client could forge. */
function assertTrackPath(path: string, userId: string, trackId: string, label: string): void {
  if (!isTrackPath(path, userId, trackId)) throw badRequest(`Invalid ${label} path`)
}

/**
 * 400 unless `path` is the track's cover path, `<userId>/<trackId>.webp`,
 * the only one the database accepts (tracks_cover_path_exact). Any other
 * extension used to pass here and fail at the insert, and createTrack then
 * deleted the audio just uploaded along with the refused row.
 */
function assertCoverPath(path: string, userId: string, trackId: string): void {
  if (path !== buildCoverPath(userId, trackId)) throw badRequest('Invalid cover path')
}

/** True for an API error the database gave for a refused write (4xx): nothing was written. */
function refusedByDatabase(error: unknown): boolean {
  // The HTTP status toHttpError gave it (none for an error that did not come from there).
  const status = (error as { statusCode?: unknown } | null)?.statusCode
  return typeof status === 'number' && status >= 400 && status < 500
}
