import type { Database, Tables, TablesInsert, TablesUpdate } from '~~/shared/types/database.types'
import { MOSAIC_SIZE, type PlaylistDetail, type PlaylistSummary, type SharedPlaylist } from '~~/shared/types/playlist'
import type { SharedTrackContent, SyncedLyricLine, TrackSummary } from '~~/shared/types/track'
import type { PlaylistCreate, PlaylistUpdate } from '~~/shared/schemas/playlist'
import type { TrackSummaryRow } from './track'

/**
 * Conversion between playlist rows (snake_case) and domain types (camelCase).
 * Pure functions: signed URLs are passed in by the services.
 */

export type PlaylistRow = Tables<'playlists'>

/** Track fields the playlist list needs (count, duration, mosaic). */
export type PlaylistTrackStatsRow = Pick<TrackSummaryRow, 'cover_path' | 'duration_seconds' | 'visibility'>

/** Looks up the signed URL of a storage path. */
export type SignedUrls = (path: string | null) => string | null

/** Cover paths of the first tracks that have one, for the mosaic. */
export function mosaicPaths(tracks: { cover_path: string | null }[]): string[] {
  const paths: string[] = []
  for (const { cover_path } of tracks) {
    if (cover_path && !paths.includes(cover_path)) paths.push(cover_path)
    if (paths.length === MOSAIC_SIZE) break
  }
  return paths
}

function totalDuration(tracks: { duration_seconds: number | null }[]): number {
  return tracks.reduce((sum, t) => sum + (t.duration_seconds ?? 0), 0)
}

function signedMosaic(tracks: { cover_path: string | null }[], signed: SignedUrls): string[] {
  return mosaicPaths(tracks).flatMap(path => signed(path) ?? [])
}

/** `tracks` must be in playlist order. */
export function toPlaylistSummary(row: PlaylistRow, tracks: PlaylistTrackStatsRow[], signed: SignedUrls): PlaylistSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    coverUrl: signed(row.cover_path),
    mosaic: signedMosaic(tracks, signed),
    trackCount: tracks.length,
    durationSeconds: totalDuration(tracks),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** `tracks` must be in playlist order, already converted. */
export function toPlaylistDetail(
  row: PlaylistRow,
  trackRows: TrackSummaryRow[],
  tracks: TrackSummary[],
  signed: SignedUrls,
): PlaylistDetail {
  return {
    ...toPlaylistSummary(row, trackRows, signed),
    coverPath: row.cover_path,
    tracks,
    privateTrackCount: trackRows.filter(t => t.visibility === 'private').length,
  }
}

export function toPlaylistInsert(userId: string, input: PlaylistCreate): TablesInsert<'playlists'> {
  return {
    user_id: userId,
    title: input.title,
    description: input.description ?? null,
    visibility: input.visibility ?? 'private',
  }
}

/** Only the fields present in the input end up in the UPDATE. */
export function toPlaylistUpdate(input: PlaylistUpdate): TablesUpdate<'playlists'> {
  const patch: TablesUpdate<'playlists'> = {}
  if (input.title !== undefined) patch.title = input.title
  if (input.description !== undefined) patch.description = input.description
  if (input.visibility !== undefined) patch.visibility = input.visibility
  if (input.coverPath !== undefined) patch.cover_path = input.coverPath
  return patch
}

// --- Sharing ----------------------------------------------------------------------

/** Row returned by the get_shared_playlist() database function. */
export type SharedPlaylistRow = Database['public']['Functions']['get_shared_playlist']['Returns'][number]
/** Row returned by the get_shared_playlist_tracks() database function. */
export type SharedPlaylistTrackRow = Database['public']['Functions']['get_shared_playlist_tracks']['Returns'][number]

export function toSharedPlaylistTrack(row: SharedPlaylistTrackRow, signed: SignedUrls): SharedTrackContent {
  return {
    id: row.id,
    title: row.title,
    composers: row.composers ?? null,
    album: row.album ?? null,
    year: row.year ?? null,
    genre: row.genre ?? null,
    description: row.description ?? null,
    lyrics: row.lyrics ?? null,
    lyricsSynced: (row.lyrics_synced as SyncedLyricLine[] | null) ?? null,
    peaks: (row.peaks as number[] | null) ?? null,
    durationSeconds: row.duration_seconds ?? null,
    coverUrl: signed(row.cover_path ?? null),
    updatedAt: row.updated_at,
  }
}

/** `tracks` must be in playlist order. */
export function toSharedPlaylist(row: SharedPlaylistRow, tracks: SharedPlaylistTrackRow[], signed: SignedUrls): SharedPlaylist {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    // The database function never returns private playlists.
    visibility: row.visibility === 'public' ? 'public' : 'unlisted',
    coverUrl: signed(row.cover_path ?? null),
    mosaic: signedMosaic(tracks.map(t => ({ cover_path: t.cover_path ?? null })), signed),
    durationSeconds: totalDuration(tracks.map(t => ({ duration_seconds: t.duration_seconds ?? null }))),
    updatedAt: row.updated_at,
    tracks: tracks.map(t => toSharedPlaylistTrack(t, signed)),
  }
}
