import type { OrphanFile, StorageCleanupResult, StorageReport, StorageUsage } from '~~/shared/types/storage'
import { COVERS_BUCKET } from '~~/shared/utils/storage-paths'
import type { DbClient } from '../utils/auth'
import type { AudioStorage } from '../repositories/audio-storage'
import * as tracksRepo from '../repositories/tracks.repository'
import * as playlistsRepo from '../repositories/playlists.repository'
import * as storageRepo from '../repositories/storage.repository'

/**
 * Storage clean-up: finds the files in a user's folders that no track or
 * playlist uses (orphans) and deletes them.
 *
 * Orphans appear when an upload is interrupted between the file transfer
 * and the track registration (e.g. the browser is closed), or when a
 * best-effort file deletion failed. Only the user's own folders are read
 * (`<userId>/…` on R2, and on Supabase Storage through RLS), with the user's
 * own rights: no admin key is involved.
 *
 * Files younger than `minAgeHours` are reported but never deleted: they may
 * belong to an upload still in progress.
 */

/** A stored file, whatever the bucket. */
interface StoredFile {
  bucket: OrphanFile['bucket']
  path: string
  sizeBytes: number
  lastModified: string
}

/** Lists every stored file of the user and everything their tracks and playlists reference. */
async function inventory(db: DbClient, audio: AudioStorage, userId: string) {
  const [audioObjects, trackCovers, playlistCovers, trackPaths, playlistCoverPaths] = await Promise.all([
    audio.list(`${userId}/`),
    storageRepo.listFolderFiles(db, COVERS_BUCKET, userId),
    storageRepo.listFolderFiles(db, COVERS_BUCKET, `${userId}/playlists`),
    tracksRepo.listTrackFilePaths(db, userId),
    playlistsRepo.listPlaylistCoverPaths(db, userId),
  ])

  const files: StoredFile[] = [
    ...audioObjects.map(o => ({ bucket: 'audio' as const, path: o.key, sizeBytes: o.size, lastModified: o.lastModified })),
    ...[...trackCovers, ...playlistCovers].map(f => ({ bucket: 'covers' as const, path: f.path, sizeBytes: f.size, lastModified: f.lastModified })),
  ]
  const referenced = new Set<string>([
    ...trackPaths.flatMap(t => [t.audio_path, ...(t.cover_path ? [t.cover_path] : [])]),
    ...playlistCoverPaths,
  ])
  return { files, referenced }
}

/** File count and total size in one bucket. */
function usageOf(files: StoredFile[], bucket: OrphanFile['bucket']): StorageUsage {
  const inBucket = files.filter(f => f.bucket === bucket)
  return { files: inBucket.length, bytes: inBucket.reduce((sum, f) => sum + f.sizeBytes, 0) }
}

/** What the user stores, and which files are orphans (deletable or still too recent). */
export async function scanStorage(
  db: DbClient,
  audio: AudioStorage,
  userId: string,
  minAgeHours: number,
  now = Date.now(),
): Promise<StorageReport> {
  const { files, referenced } = await inventory(db, audio, userId)
  const minAgeMs = minAgeHours * 60 * 60 * 1000
  const orphans = files
    .filter(f => !referenced.has(f.path))
    .map(f => ({ ...f, deletable: now - Date.parse(f.lastModified) >= minAgeMs }))
    .sort((a, b) => a.lastModified.localeCompare(b.lastModified))
  return {
    usage: { audio: usageOf(files, 'audio'), covers: usageOf(files, 'covers') },
    orphans,
    minAgeHours,
  }
}

/**
 * Deletes every orphan old enough. The scan is redone here, on the server:
 * what the client was shown is never trusted, so a file a track started
 * using in the meantime cannot be deleted.
 */
export async function cleanStorage(
  db: DbClient,
  audio: AudioStorage,
  userId: string,
  minAgeHours: number,
  now = Date.now(),
): Promise<StorageCleanupResult> {
  const { orphans } = await scanStorage(db, audio, userId, minAgeHours, now)
  const doomed = orphans.filter(o => o.deletable)
  const paths = (bucket: OrphanFile['bucket']) => doomed.filter(o => o.bucket === bucket).map(o => o.path)

  // Both removals are best effort: a file that could not be deleted shows up again next time.
  await Promise.all([
    audio.remove(paths('audio')),
    storageRepo.removeObjects(db, COVERS_BUCKET, paths('covers')),
  ])

  return {
    deletedFiles: doomed.length,
    freedBytes: doomed.reduce((sum, o) => sum + o.sizeBytes, 0),
    keptFiles: orphans.length - doomed.length,
  }
}
