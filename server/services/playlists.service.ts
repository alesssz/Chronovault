import { createError } from 'h3'
import type { PlaylistDetail, PlaylistSummary } from '~~/shared/types/playlist'
import type { PlaylistCreate, PlaylistUpdate } from '~~/shared/schemas/playlist'
import { MAX_PLAYLIST_TRACKS } from '~~/shared/schemas/playlist'
import { COVERS_BUCKET, buildPlaylistCoverPath } from '~~/shared/utils/storage-paths'
import type { DbClient } from '../utils/auth'
import { notFound } from '../utils/errors'
import { toTrackSummary } from '../mappers/track'
import {
  mosaicPaths,
  toPlaylistDetail,
  toPlaylistInsert,
  toPlaylistSummary,
  toPlaylistUpdate,
  type SignedUrls,
} from '../mappers/playlist'
import * as playlistsRepo from '../repositories/playlists.repository'
import * as storageRepo from '../repositories/storage.repository'

/**
 * Playlist business logic: an ordered list of the user's own tracks.
 * Covers are signed in bulk: the custom cover plus the first track covers
 * (the automatic mosaic).
 *
 * Every mutation returns the fresh PlaylistDetail, so the client can replace
 * its copy with the server's (no second request).
 */

const playlistNotFound = () => notFound('Playlist not found')

/** The user's playlists, newest first, with all covers signed in one request. */
export async function listPlaylists(db: DbClient, userId: string): Promise<PlaylistSummary[]> {
  const rows = await playlistsRepo.listPlaylistRows(db, userId)
  const ordered = rows.map(row => ({ row, tracks: playlistsRepo.orderedTracks(row.playlist_tracks) }))
  const signed = await signCovers(db, ordered.flatMap(({ row, tracks }) => [row.cover_path, ...mosaicPaths(tracks)]))
  return ordered.map(({ row, tracks }) => toPlaylistSummary(row, tracks, signed))
}

/** One playlist with its tracks in order (404 when missing or not the user's). */
export async function getPlaylist(db: DbClient, userId: string, id: string): Promise<PlaylistDetail> {
  const row = await playlistsRepo.findPlaylistRow(db, userId, id)
  if (!row) throw playlistNotFound()
  const trackRows = playlistsRepo.orderedTracks(row.playlist_tracks)
  const signed = await signCovers(db, [row.cover_path, ...trackRows.map(t => t.cover_path)])
  const tracks = trackRows.map(t => toTrackSummary(t, signed(t.cover_path)))
  return toPlaylistDetail(row, trackRows, tracks, signed)
}

/**
 * Creates a playlist, optionally with its first tracks (e.g. "New playlist…"
 * from a track's menu). Two steps: if adding the tracks fails (e.g. one is
 * not the user's), the empty playlist remains and the error is returned.
 */
export async function createPlaylist(db: DbClient, userId: string, input: PlaylistCreate): Promise<PlaylistDetail> {
  const row = await playlistsRepo.insertPlaylistRow(db, toPlaylistInsert(userId, input))
  if (input.trackIds?.length) await playlistsRepo.setPlaylistTrackIds(db, row.id, input.trackIds)
  return getPlaylist(db, userId, row.id)
}

/**
 * Updates metadata and/or the custom cover. The cover must be the
 * playlist's own path; `coverPath: null` removes it and deletes the file.
 */
export async function updatePlaylist(db: DbClient, userId: string, id: string, input: PlaylistUpdate): Promise<PlaylistDetail> {
  if (input.coverPath && input.coverPath !== buildPlaylistCoverPath(userId, id)) {
    throw createError({ statusCode: 400, message: 'Invalid cover path' })
  }

  // When the cover is removed we need the old path to delete the file.
  const previousCover = input.coverPath === null
    ? (await playlistsRepo.findPlaylistRow(db, userId, id))?.cover_path ?? null
    : null

  const row = await playlistsRepo.updatePlaylistRow(db, userId, id, toPlaylistUpdate(input))
  if (!row) throw playlistNotFound()

  if (previousCover) await storageRepo.removeObjects(db, COVERS_BUCKET, [previousCover])
  return getPlaylist(db, userId, id)
}

/** Deletes the playlist and its custom cover. Its tracks stay in the library. */
export async function deletePlaylist(db: DbClient, userId: string, id: string): Promise<void> {
  const deleted = await playlistsRepo.deletePlaylistRow(db, userId, id)
  if (!deleted) throw playlistNotFound()
  if (deleted.cover_path) await storageRepo.removeObjects(db, COVERS_BUCKET, [deleted.cover_path])
}

/** Replaces the tracks of the playlist: reordering and removal. */
export async function setPlaylistTracks(db: DbClient, userId: string, id: string, trackIds: string[]): Promise<PlaylistDetail> {
  if ((await playlistsRepo.findPlaylistTrackIds(db, userId, id)) === null) throw playlistNotFound()
  await playlistsRepo.setPlaylistTrackIds(db, id, trackIds)
  return getPlaylist(db, userId, id)
}

/** Appends tracks to the playlist; tracks already in it are left where they are. */
export async function addPlaylistTracks(db: DbClient, userId: string, id: string, trackIds: string[]): Promise<PlaylistDetail> {
  const current = await playlistsRepo.findPlaylistTrackIds(db, userId, id)
  if (current === null) throw playlistNotFound()
  const added = trackIds.filter(trackId => !current.includes(trackId))
  if (added.length > 0) {
    if (current.length + added.length > MAX_PLAYLIST_TRACKS) {
      throw createError({ statusCode: 400, message: `A playlist holds at most ${MAX_PLAYLIST_TRACKS} tracks` })
    }
    await playlistsRepo.setPlaylistTrackIds(db, id, [...current, ...added])
  }
  return getPlaylist(db, userId, id)
}

/** Signs a set of cover paths in one request and returns a lookup function. */
async function signCovers(db: DbClient, paths: (string | null)[]): Promise<SignedUrls> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))]
  const urls = await storageRepo.createSignedUrls(db, COVERS_BUCKET, unique)
  return path => (path ? urls.get(path) ?? null : null)
}
