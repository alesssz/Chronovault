import { createError } from 'h3'
import type { AudioUploadTarget, PlaybackSource, TrackDetail, TrackSummary } from '~~/shared/types/track'
import type { AudioUploadRequest, TrackCreate, TrackUpdate } from '~~/shared/schemas/track'
import { MAX_AUDIO_BYTES } from '~~/shared/utils/audio-files'
import { COVERS_BUCKET, buildAudioPath, isTrackPath } from '~~/shared/utils/storage-paths'
import type { DbClient } from '../utils/auth'
import { notFound } from '../utils/errors'
import { toTrackDetail, toTrackInsert, toTrackSummary, toTrackUpdate } from '../mappers/track'
import type { AudioStorage } from '../repositories/audio-storage'
import * as tracksRepo from '../repositories/tracks.repository'
import * as storageRepo from '../repositories/storage.repository'

/**
 * Track business logic. Knows nothing about HTTP or Nuxt: it receives an
 * already-authenticated database client, the audio storage and the user id,
 * and returns domain types.
 *
 * Audio files live on the S3-compatible audio storage (Cloudflare R2);
 * covers live in Supabase Storage.
 */

/** Lifetime of a presigned upload URL (the upload must start within it). */
export const UPLOAD_URL_TTL = 60 * 60

export async function listTracks(db: DbClient, userId: string): Promise<TrackSummary[]> {
  const rows = await tracksRepo.listTrackRows(db, userId)
  const coverPaths = rows.flatMap(row => (row.cover_path ? [row.cover_path] : []))
  const coverUrls = await storageRepo.createSignedUrls(db, COVERS_BUCKET, coverPaths)
  return rows.map(row => toTrackSummary(row, row.cover_path ? coverUrls.get(row.cover_path) ?? null : null))
}

export async function getTrack(db: DbClient, userId: string, id: string): Promise<TrackDetail> {
  const row = await tracksRepo.findTrackRow(db, userId, id)
  if (!row) throw notFound()
  return toTrackDetail(row, await signCover(db, row.cover_path))
}

/** Presigned URL the browser uploads the audio file to, inside the user's folder. */
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
    throw createError({ statusCode: 400, message: 'Audio file not found: finish the upload first' })
  }
  if (stored.size !== input.sizeBytes || stored.size > MAX_AUDIO_BYTES) {
    await audio.remove([input.audioPath])
    throw createError({ statusCode: 400, message: 'The uploaded file does not match the declared one' })
  }

  try {
    const row = await tracksRepo.insertTrackRow(db, toTrackInsert(userId, input))
    return toTrackDetail(row, await signCover(db, row.cover_path))
  }
  catch (error) {
    // No orphaned audio when the track could not be registered.
    await audio.remove([input.audioPath])
    throw error
  }
}

export async function updateTrack(db: DbClient, userId: string, id: string, input: TrackUpdate): Promise<TrackDetail> {
  if (input.coverPath) assertTrackPath(input.coverPath, userId, id, 'cover')

  // When the cover is removed we need the old path to delete the file.
  const previousCover = input.coverPath === null
    ? (await tracksRepo.findTrackRow(db, userId, id))?.cover_path ?? null
    : null

  const row = await tracksRepo.updateTrackRow(db, userId, id, toTrackUpdate(input))
  if (!row) throw notFound()

  if (previousCover) await storageRepo.removeObjects(db, COVERS_BUCKET, [previousCover])
  return toTrackDetail(row, await signCover(db, row.cover_path))
}

export async function deleteTrack(db: DbClient, audio: AudioStorage, userId: string, id: string): Promise<void> {
  const paths = await tracksRepo.deleteTrackRow(db, userId, id)
  if (!paths) throw notFound()

  await Promise.all([
    audio.remove([paths.audio_path]),
    paths.cover_path ? storageRepo.removeObjects(db, COVERS_BUCKET, [paths.cover_path]) : Promise.resolve(),
  ])
}

export async function getPlaybackSource(
  db: DbClient,
  audio: AudioStorage,
  userId: string,
  id: string,
): Promise<PlaybackSource> {
  const audioPath = await tracksRepo.findTrackAudioPath(db, userId, id)
  if (!audioPath) throw notFound()
  return {
    url: await audio.presign('GET', audioPath, storageRepo.SIGNED_URL_TTL),
    expiresAt: expiresIn(storageRepo.SIGNED_URL_TTL),
  }
}

function expiresIn(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString()
}

function assertTrackPath(path: string, userId: string, trackId: string, label: string): void {
  if (!isTrackPath(path, userId, trackId)) {
    throw createError({ statusCode: 400, message: `Invalid ${label} path` })
  }
}

async function signCover(db: DbClient, path: string | null): Promise<string | null> {
  if (!path) return null
  try {
    return await storageRepo.createSignedUrl(db, COVERS_BUCKET, path)
  }
  catch {
    return null
  }
}
