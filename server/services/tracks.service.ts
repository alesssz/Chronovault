import type { AudioUploadTarget, PlaybackSource, TrackDetail, TrackSummary } from '~~/shared/types/track'
import type { AudioUploadRequest, TrackCreate, TrackUpdate } from '~~/shared/schemas/track'
import { MAX_AUDIO_BYTES } from '~~/shared/utils/audio-files'
import { buildAudioPath, isTrackPath } from '~~/shared/utils/storage-paths'
import type { DbClient } from '../utils/auth'
import { badRequest, notFound } from '../utils/errors'
import { toTrackDetail, toTrackInsert, toTrackSummary, toTrackUpdate } from '../mappers/track'
import type { AudioStorage } from '../repositories/audio-storage'
import * as tracksRepo from '../repositories/tracks.repository'
import { expiresIn, presignPlayback, removeCoverFiles } from './playback'

/**
 * Track business logic. Knows nothing about HTTP or Nuxt: it receives an
 * already-authenticated database client, the audio storage and the user id,
 * and returns domain types. That keeps it unit-testable with mocked
 * repositories (test/unit/server/tracks.service.test.ts).
 *
 * Audio files live on the S3-compatible audio storage (Cloudflare R2);
 * covers live in Supabase Storage.
 *
 * Upload sequence (see README → Data flows → Uploading a track):
 *   1. createUploadTarget → presigned PUT URL
 *   2. the browser uploads the file straight to R2
 *   3. createTrack → checks the stored file, then inserts the row
 */

/** Lifetime of a presigned upload URL (the upload must start within it). */
export const UPLOAD_URL_TTL = 60 * 60

/**
 * The user's library. Covers need no signing: their addresses are stable
 * and served (with browser caching) by /api/covers (see mappers/cover-urls.ts).
 */
export async function listTracks(db: DbClient, userId: string): Promise<TrackSummary[]> {
  const rows = await tracksRepo.listTrackRows(db, userId)
  return rows.map(toTrackSummary)
}

/** Full detail of one of the user's tracks (404 otherwise). */
export async function getTrack(db: DbClient, userId: string, id: string): Promise<TrackDetail> {
  const row = await tracksRepo.findTrackRow(db, userId, id)
  if (!row) throw notFound()
  return toTrackDetail(row)
}

/**
 * Presigned URL the browser uploads the audio file to, inside the user's folder.
 * The path is built here from the user id, never taken from the client, so a
 * client cannot upload into someone else's folder.
 */
export async function createUploadTarget(
  audio: AudioStorage,
  userId: string,
  request: AudioUploadRequest,
): Promise<AudioUploadTarget> {
  const audioPath = buildAudioPath(userId, request.trackId, request.extension)
  return {
    uploadUrl: await audio.presign('PUT', audioPath, UPLOAD_URL_TTL),
    audioPath,
    expiresAt: expiresIn(UPLOAD_URL_TTL),
  }
}

/**
 * Registers an uploaded track. Paths must point into the user's folder and
 * to this track id; the file must exist with the declared size. A mismatched
 * file is deleted; so is the file when the insert fails (no orphans).
 */
export async function createTrack(
  db: DbClient,
  audio: AudioStorage,
  userId: string,
  input: TrackCreate,
): Promise<TrackDetail> {
  assertTrackPath(input.audioPath, userId, input.id, 'audio')
  if (input.coverPath) assertTrackPath(input.coverPath, userId, input.id, 'cover')

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
    const row = await tracksRepo.insertTrackRow(db, toTrackInsert(userId, input))
    return toTrackDetail(row)
  }
  catch (error) {
    // No orphaned audio when the track could not be registered.
    await audio.remove([input.audioPath])
    throw error
  }
}

/**
 * Updates metadata and/or the cover. `coverPath: null` removes the cover
 * and deletes its file once the row is updated.
 */
export async function updateTrack(db: DbClient, userId: string, id: string, input: TrackUpdate): Promise<TrackDetail> {
  if (input.coverPath) assertTrackPath(input.coverPath, userId, id, 'cover')

  // When the cover is removed we need the old path to delete the file.
  const previousCover = input.coverPath === null
    ? (await tracksRepo.findTrackRow(db, userId, id))?.cover_path ?? null
    : null

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
  const paths = await tracksRepo.deleteTrackRow(db, userId, id)
  if (!paths) throw notFound()

  await Promise.all([
    audio.remove([paths.audio_path]),
    removeCoverFiles(db, [paths.cover_path]),
  ])
}

/** Time-limited streaming URL (presigned GET, 6 h) of one of the user's tracks. */
export async function getPlaybackSource(
  db: DbClient,
  audio: AudioStorage,
  userId: string,
  id: string,
): Promise<PlaybackSource> {
  const audioPath = await tracksRepo.findTrackAudioPath(db, userId, id)
  if (!audioPath) throw notFound()
  return presignPlayback(audio, audioPath)
}

/** 400 unless `path` is `<userId>/<trackId>.<ext>`: rejects paths a client could forge. */
function assertTrackPath(path: string, userId: string, trackId: string, label: string): void {
  if (!isTrackPath(path, userId, trackId)) throw badRequest(`Invalid ${label} path`)
}
