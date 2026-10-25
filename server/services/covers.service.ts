import { COVERS_BUCKET } from '~~/shared/utils/storage-paths'
import type { DbClient } from '../utils/auth'
import { notFound } from '../utils/errors'
import * as tracksRepo from '../repositories/tracks.repository'
import * as playlistsRepo from '../repositories/playlists.repository'
import * as storageRepo from '../repositories/storage.repository'

/**
 * Cover images of the owner's library, served by the app at stable
 * addresses so the browser can cache them (see mappers/cover-urls.ts).
 *
 * The cover is read from Supabase Storage with the user's own token: RLS
 * guarantees it is the user's file. A track or playlist without a cover, or
 * that is not the user's, answers 404.
 */

/** Image bytes and their MIME type, ready to send. */
export interface CoverImageFile {
  /** The image file's bytes. */
  bytes: Uint8Array
  /** Its MIME type (always an image type; WebP by default). */
  contentType: string
}

/** Reads a cover file; 404 when there is no path or the file cannot be read. */
async function readCover(db: DbClient, path: string | null): Promise<CoverImageFile> {
  if (!path) throw notFound('Cover not found')
  // The file, read with the user's rights (null when missing or not theirs).
  const blob = await storageRepo.downloadObject(db, COVERS_BUCKET, path)
  if (!blob) throw notFound('Cover not found')
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    // Covers are always stored as WebP; the blob type is only a fallback check.
    contentType: blob.type.startsWith('image/') ? blob.type : 'image/webp',
  }
}

/** The cover of one of the user's tracks. */
export async function getTrackCover(db: DbClient, userId: string, trackId: string): Promise<CoverImageFile> {
  return readCover(db, await tracksRepo.findTrackCoverPath(db, userId, trackId))
}

/** The custom cover of one of the user's playlists. */
export async function getPlaylistCover(db: DbClient, userId: string, playlistId: string): Promise<CoverImageFile> {
  return readCover(db, await playlistsRepo.findPlaylistCoverPath(db, userId, playlistId))
}
