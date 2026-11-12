import type { AudioUploadTarget, PlaybackSource, TrackDetail, TrackMetadata, TrackSummary } from '~~/shared/types/track'
import type { AudioReplace, AudioReplaceUpload, AudioUploadRequest, TrackCreate, TrackUpdate } from '~~/shared/schemas/track'
import { MAX_AUDIO_BYTES } from '~~/shared/utils/audio-files'
import { buildAudioPath, buildCoverPath, isAudioPath, isAudioRevisionPath, newAudioRevision } from '~~/shared/utils/storage-paths'
import type { DbClient } from '../utils/auth'
import { badRequest, conflict, isConflict, notFound } from '../utils/errors'
import { toTrackDetail, toTrackInsert, toTrackMetadata, toTrackSummary, toTrackUpdate } from '../mappers/track'
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
 *
 * Replace sequence (7.19 Replacing a track's audio): the same three steps for
 * a track already registered, its metadata untouched:
 *   1. createReplaceTarget → presigned PUT URL for a new key next to the old file
 *   2. the browser uploads the file straight to R2
 *   3. replaceTrackAudio → checks the stored file, moves the row to it, deletes the old file
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

/**
 * Every metadata field of every track of the user, long texts included (the
 * metadata export, and what the import compares a file with): one request,
 * where the detail of each track would be one per track, peaks and all.
 */
export async function listTrackMetadata(db: DbClient, userId: string): Promise<TrackMetadata[]> {
  const rows = await tracksRepo.listTrackMetadataRows(db, userId)
  return rows.map(toTrackMetadata)
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
 * to this track id, exactly as the database requires (the audio
 * `<userId>/<trackId>.<ext>` with an extension of 1 to 10 lower-case letters
 * and digits, the cover `<userId>/<trackId>.webp`); the file must exist with
 * the declared size. A
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
  assertAudioPath(input.audioPath, userId, input.id)
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
 * Presigned URL the browser uploads a track's new audio file to (Replace
 * audio). The key is `<userId>/<trackId>.<revision>.<ext>`, the revision
 * drawn here: never the key the track names, so the new file is stored next
 * to the old one and the track keeps playing the old one until
 * replaceTrackAudio moves it. Only for one of the user's own tracks (404).
 */
export async function createReplaceTarget(
  db: DbClient,
  audio: AudioStorage,
  userId: string,
  trackId: string,
  request: AudioReplaceUpload,
): Promise<AudioUploadTarget> {
  if (!(await tracksRepo.findTrackAudioPath(db, userId, trackId))) throw notFound()
  // The new file's key: built here, from the signed-in user's id, the track's and a fresh revision.
  const audioPath = buildAudioPath(userId, trackId, request.extension, newAudioRevision())
  return {
    // For this file only: its declared size and type are part of the signature.
    uploadUrl: await audio.presign('PUT', audioPath, UPLOAD_URL_TTL, { size: request.sizeBytes, contentType: request.mimeType }),
    audioPath,
    expiresAt: expiresIn(UPLOAD_URL_TTL),
  }
}

/**
 * Replaces one of the user's tracks' audio with the file uploaded to
 * `input.audioPath` (createReplaceTarget's key), keeping everything else:
 * metadata, lyrics, cover, plays, votes, playlists, share links. Only the
 * file and what is measured from it change (format, size, duration, peaks).
 *
 * When the track has synced lyrics they stay, flagged `sync_needs_review`: a
 * master may trim or shift the audio, so their times may be off until the
 * owner checks them (the Sync tab's "Sync checked").
 *
 * In order, so that the track never names a missing or unchecked file:
 *   1. the path must be a replacement path of this track (400 before anything is touched);
 *   2. the track is read (404 when not the user's); its own current path is refused (400);
 *   3. the stored file must be there with the declared size (else it is deleted, 400);
 *   4. the row moves to the new file only if it still names the file read in 2:
 *      a replace from another tab that got there first wins, and this one's
 *      file is deleted (409);
 *   5. the old file is deleted, best effort (a failure leaves an orphan for
 *      the Storage dialog, docs 7.12).
 * When the database refuses the update (4xx) the new file is deleted; with no
 * answer to trust (500) it is kept, as in createTrack: it may be the file the
 * committed row names.
 */
export async function replaceTrackAudio(
  db: DbClient,
  audio: AudioStorage,
  userId: string,
  trackId: string,
  input: AudioReplace,
): Promise<TrackDetail> {
  if (!isAudioRevisionPath(input.audioPath, userId, trackId)) throw badRequest('Invalid audio path')

  // The track as it is: its current file, and whether it has synced lyrics.
  const current = await tracksRepo.findTrackRow(db, userId, trackId)
  if (!current) throw notFound()
  if (current.audio_path === input.audioPath) throw badRequest('This file is already the track\'s audio')

  // The browser uploaded the file straight to storage: make sure it is the one declared.
  const stored = await audio.head(input.audioPath)
  if (!stored) throw badRequest('Audio file not found: finish the upload first')
  if (stored.size !== input.sizeBytes || stored.size > MAX_AUDIO_BYTES) {
    await audio.remove([input.audioPath])
    throw badRequest('The uploaded file does not match the declared one')
  }

  // The row moved to the new file, or null when another replace moved it first.
  let row: Awaited<ReturnType<typeof tracksRepo.swapTrackAudioRow>>
  try {
    row = await tracksRepo.swapTrackAudioRow(db, userId, trackId, current.audio_path, {
      audio_path: input.audioPath,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      duration_seconds: input.durationSeconds ?? null,
      peaks: input.peaks ?? null,
      // Synced lyrics were timed against the old file: flag them for checking.
      ...(current.has_synced_lyrics ? { sync_needs_review: true } : {}),
    })
  }
  catch (error) {
    // Refused (4xx): nothing was written, the new file is nobody's. Unknown (500): kept, see above.
    if (refusedByDatabase(error)) await audio.remove([input.audioPath])
    throw error
  }
  if (!row) {
    await audio.remove([input.audioPath])
    throw conflict('The audio was replaced meanwhile: reload the page')
  }

  // The old file is no track's any more.
  await audio.remove([current.audio_path])
  return toTrackDetail(row)
}

/**
 * Updates metadata and/or the cover. `coverPath: null` removes the cover
 * and deletes its file once the row is updated. Emptying the synced lyrics
 * also clears their "check the sync" flag (there is nothing left to check).
 */
export async function updateTrack(db: DbClient, userId: string, id: string, input: TrackUpdate): Promise<TrackDetail> {
  if (input.coverPath) assertCoverPath(input.coverPath, userId, id)

  // A genre sent without a subgenre: the current one decides whether the subgenre stays.
  const genreWithoutSubgenre = input.genreId !== undefined && input.subgenreId === undefined
  // The row as it is, when needed (none when missing or not the user's: the update then answers 404).
  const current = input.coverPath === null || genreWithoutSubgenre
    ? await tracksRepo.findTrackRow(db, userId, id)
    : null

  // When the cover is removed we need the old path to delete the file.
  const previousCover = input.coverPath === null ? current?.cover_path ?? null : null

  // A new genre without a subgenre: the old subgenre (of the old genre) goes, or the
  // database would refuse the pair. The same genre sent again keeps it.
  if (genreWithoutSubgenre && current && current.genre_id !== input.genreId) input = { ...input, subgenreId: null }

  // Synced lyrics emptied: nothing is left to check after a replaced audio.
  if (input.lyricsSynced !== undefined && !input.lyricsSynced?.length) input = { ...input, syncNeedsReview: false }

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

/** 400 unless `path` is `<userId>/<trackId>.<ext>` as the database accepts it: rejects paths a client could forge. */
function assertAudioPath(path: string, userId: string, trackId: string): void {
  if (!isAudioPath(path, userId, trackId)) throw badRequest('Invalid audio path')
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
