import { createError } from 'h3'
import type { PlaybackSource, TrackDetail, TrackSummary } from '~~/shared/types/track'
import type { TrackCreate, TrackUpdate } from '~~/shared/schemas/track'
import { AUDIO_BUCKET, COVERS_BUCKET, isTrackPath } from '~~/shared/utils/storage-paths'
import type { DbClient } from '../utils/auth'
import { notFound } from '../utils/errors'
import { toTrackDetail, toTrackInsert, toTrackSummary, toTrackUpdate } from '../mappers/track'
import * as tracksRepo from '../repositories/tracks.repository'
import * as storageRepo from '../repositories/storage.repository'

/**
 * Track business logic. Knows nothing about HTTP or Nuxt: it receives an
 * already-authenticated client and the user id, and returns domain types.
 */

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

export async function createTrack(db: DbClient, userId: string, input: TrackCreate): Promise<TrackDetail> {
  assertTrackPath(input.audioPath, userId, input.id, 'audio')
  if (input.coverPath) assertTrackPath(input.coverPath, userId, input.id, 'cover')

  // The client uploads the file straight to storage before calling the API:
  // make sure the upload actually happened.
  if (!(await storageRepo.objectExists(db, AUDIO_BUCKET, input.audioPath))) {
    throw createError({ statusCode: 400, message: 'Audio file not found: finish the upload first' })
  }

  const row = await tracksRepo.insertTrackRow(db, toTrackInsert(userId, input))
  return toTrackDetail(row, await signCover(db, row.cover_path))
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

export async function deleteTrack(db: DbClient, userId: string, id: string): Promise<void> {
  const paths = await tracksRepo.deleteTrackRow(db, userId, id)
  if (!paths) throw notFound()

  await Promise.all([
    storageRepo.removeObjects(db, AUDIO_BUCKET, [paths.audio_path]),
    paths.cover_path ? storageRepo.removeObjects(db, COVERS_BUCKET, [paths.cover_path]) : Promise.resolve(),
  ])
}

export async function getPlaybackSource(db: DbClient, userId: string, id: string): Promise<PlaybackSource> {
  const audioPath = await tracksRepo.findTrackAudioPath(db, userId, id)
  if (!audioPath) throw notFound()
  const url = await storageRepo.createSignedUrl(db, AUDIO_BUCKET, audioPath)
  return { url, expiresAt: new Date(Date.now() + storageRepo.SIGNED_URL_TTL * 1000).toISOString() }
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
