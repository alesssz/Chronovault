import type { PlaylistDetail, PlaylistPurpose, PlaylistSummary } from '~~/shared/types/playlist'
import type { PlaylistCreate, PlaylistUpdate } from '~~/shared/schemas/playlist'
import { MAX_PLAYLIST_TRACKS } from '~~/shared/schemas/playlist'
import { buildPlaylistCoverPath } from '~~/shared/utils/storage-paths'
import type { DbClient } from '../utils/auth'
import { badRequest, playlistNotFound } from '../utils/errors'
import {
  toPlaylistDetail,
  toPlaylistInsert,
  toPlaylistSummary,
  toPlaylistUpdate,
} from '../mappers/playlist'
import * as playlistsRepo from '../repositories/playlists.repository'
import { removeCoverFiles } from './playback'

/**
 * Playlist business logic: an ordered list of the user's own tracks.
 * The same logic serves both purposes: curated playlists and groups of versions
 * sent for feedback (only the lists are split by purpose).
 * Covers (the custom one, plus the first track covers for the automatic
 * mosaic) are stable /api/covers addresses built by the mappers: nothing to
 * sign, and the browser caches them across visits.
 *
 * Every mutation returns the fresh PlaylistDetail, so the client can replace
 * its copy with the server's (no second request).
 */

/** The user's playlists of one purpose, newest first (cover addresses are stable: nothing to sign). */
export async function listPlaylists(db: DbClient, userId: string, purpose: PlaylistPurpose): Promise<PlaylistSummary[]> {
  // The playlists with just enough track data for the cards.
  const rows = await playlistsRepo.listPlaylistRows(db, userId, purpose)
  return rows.map(row => toPlaylistSummary(row, playlistsRepo.orderedTracks(row.playlist_tracks)))
}

/** One playlist with its tracks in order (404 when missing or not the user's). */
export async function getPlaylist(db: DbClient, userId: string, id: string): Promise<PlaylistDetail> {
  // The playlist with every track (none when missing or not the user's).
  const row = await playlistsRepo.findPlaylistRow(db, userId, id)
  if (!row) throw playlistNotFound()
  return toPlaylistDetail(row, playlistsRepo.orderedTracks(row.playlist_tracks))
}

/**
 * Creates a playlist, optionally with its first tracks (e.g. "New playlist…"
 * from a track's menu). Two steps: if adding the tracks fails (e.g. one is
 * not the user's), the empty playlist remains and the error is returned.
 */
export async function createPlaylist(db: DbClient, userId: string, input: PlaylistCreate): Promise<PlaylistDetail> {
  // The new playlist, still empty.
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
    throw badRequest('Invalid cover path')
  }

  // When the cover is removed we need the old path to delete the file.
  const previousCover = input.coverPath === null
    ? (await playlistsRepo.findPlaylistRow(db, userId, id))?.cover_path ?? null
    : null

  // The updated row (none when missing or not the user's).
  const row = await playlistsRepo.updatePlaylistRow(db, userId, id, toPlaylistUpdate(input))
  if (!row) throw playlistNotFound()

  await removeCoverFiles(db, [previousCover])
  return getPlaylist(db, userId, id)
}

/** Deletes the playlist and its custom cover. Its tracks stay in the library. */
export async function deletePlaylist(db: DbClient, userId: string, id: string): Promise<void> {
  // The deleted row's cover path, or none when nothing was deleted.
  const deleted = await playlistsRepo.deletePlaylistRow(db, userId, id)
  if (!deleted) throw playlistNotFound()
  await removeCoverFiles(db, [deleted.cover_path])
}

/** Replaces the tracks of the playlist: reordering and removal. */
export async function setPlaylistTracks(db: DbClient, userId: string, id: string, trackIds: string[]): Promise<PlaylistDetail> {
  if ((await playlistsRepo.findPlaylistTrackIds(db, userId, id)) === null) throw playlistNotFound()
  await playlistsRepo.setPlaylistTrackIds(db, id, trackIds)
  return getPlaylist(db, userId, id)
}

/** Appends tracks to the playlist; tracks already in it are left where they are. */
export async function addPlaylistTracks(db: DbClient, userId: string, id: string, trackIds: string[]): Promise<PlaylistDetail> {
  // The track ids already in the playlist, in order (null: no such playlist).
  const current = await playlistsRepo.findPlaylistTrackIds(db, userId, id)
  if (current === null) throw playlistNotFound()
  // Only the tracks not in it yet, in the order given.
  const added = trackIds.filter(trackId => !current.includes(trackId))
  if (added.length > 0) {
    if (current.length + added.length > MAX_PLAYLIST_TRACKS) {
      throw badRequest(`A playlist holds at most ${MAX_PLAYLIST_TRACKS} tracks`)
    }
    await playlistsRepo.setPlaylistTrackIds(db, id, [...current, ...added])
  }
  return getPlaylist(db, userId, id)
}
