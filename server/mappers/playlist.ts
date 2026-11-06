import type { Database, Tables, TablesInsert, TablesUpdate } from '~~/shared/types/database.types'
import { MOSAIC_SIZE, type PlaylistDetail, type PlaylistSummary, type SharedPlaylist } from '~~/shared/types/playlist'
import type { SharedTrackContent } from '~~/shared/types/track'
import type { PlaylistCreate, PlaylistUpdate } from '~~/shared/schemas/playlist'
import { toSharedTrackContent, toTrackSummary, type TrackSummaryRow } from './track'
import { playlistCoverUrlOf, trackCoverUrl } from './cover-urls'

/**
 * Conversion between playlist rows (snake_case) and domain types (camelCase).
 * Pure functions. The owner's views use stable, cacheable cover addresses
 * (cover-urls.ts); public pages use signed URLs, passed in by the sharing
 * service as a lookup function (`SignedUrls`) built from one bulk request.
 *
 * Playlist covers: the custom cover when uploaded, plus a "mosaic" of the
 * first track covers that the UI shows when there is no custom cover.
 */

export type PlaylistRow = Tables<'playlists'>

/** Track fields the playlist list needs (count, duration, mosaic). */
export type PlaylistTrackStatsRow = Pick<TrackSummaryRow, 'id' | 'cover_path' | 'duration_seconds' | 'visibility' | 'updated_at'>

/** Looks up the signed URL of a storage path (null for no path, or a path that could not be signed). Public pages only. */
export type SignedUrls = (path: string | null) => string | null

/**
 * The first tracks that have a cover, for the mosaic: at most MOSAIC_SIZE,
 * in playlist order, without repeating a cover file.
 */
export function mosaicTracks<T extends { cover_path: string | null }>(tracks: T[]): T[] {
  // Collected in playlist order, at most MOSAIC_SIZE.
  const picked: T[] = []
  for (const track of tracks) {
    if (track.cover_path && !picked.some(p => p.cover_path === track.cover_path)) picked.push(track)
    if (picked.length === MOSAIC_SIZE) break
  }
  return picked
}

/** Cover paths of the mosaic tracks (public pages sign them; link previews use the first). */
export function mosaicPaths(tracks: { cover_path: string | null }[]): string[] {
  return mosaicTracks(tracks).map(t => t.cover_path!)
}

/** Sum of the durations; tracks without a measured duration count as 0. */
function totalDuration(tracks: { duration_seconds: number | null }[]): number {
  return tracks.reduce((sum, t) => sum + (t.duration_seconds ?? 0), 0)
}

/** Mosaic paths → signed URLs, dropping covers that could not be signed (public pages). */
function signedMosaic(tracks: { cover_path: string | null }[], signed: SignedUrls): string[] {
  return mosaicPaths(tracks).flatMap(path => signed(path) ?? [])
}

/**
 * Playlist card data, with stable cover addresses (custom cover and mosaic,
 * see cover-urls.ts). `tracks` must be in playlist order.
 */
export function toPlaylistSummary(row: PlaylistRow, tracks: PlaylistTrackStatsRow[]): PlaylistSummary {
  return {
    id: row.id,
    purpose: row.purpose,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    coverUrl: playlistCoverUrlOf(row),
    // The mosaic shows the covers of the tracks themselves.
    mosaic: mosaicTracks(tracks).map(t => trackCoverUrl(t.id, t.updated_at)),
    trackCount: tracks.length,
    durationSeconds: totalDuration(tracks),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Playlist page data. `trackRows` must be in playlist order. */
export function toPlaylistDetail(row: PlaylistRow, trackRows: TrackSummaryRow[]): PlaylistDetail {
  return {
    ...toPlaylistSummary(row, trackRows),
    coverPath: row.cover_path,
    tracks: trackRows.map(toTrackSummary),
    privateTrackCount: trackRows.filter(t => t.visibility === 'private').length,
  }
}

/** Validated create body → insert row (the tracks are added separately, see set_playlist_tracks). */
export function toPlaylistInsert(userId: string, input: PlaylistCreate): TablesInsert<'playlists'> {
  return {
    user_id: userId,
    purpose: input.purpose ?? 'playlist',
    title: input.title,
    description: input.description ?? null,
    visibility: input.visibility ?? 'private',
  }
}

/** Only the fields present in the input end up in the UPDATE (`null` clears a field). */
export function toPlaylistUpdate(input: PlaylistUpdate): TablesUpdate<'playlists'> {
  // Only fields actually sent (not undefined) are copied.
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

/**
 * One track of a shared playlist: shareable fields only. The row's
 * `audio_path` is used by the service to sign playback URLs; only its
 * extension reaches the response (the visitor's download), and of its
 * `visibility` only whether it may be downloaded.
 */
export function toSharedPlaylistTrack(row: SharedPlaylistTrackRow, signed: SignedUrls): SharedTrackContent {
  // Same shareable fields as a shared track's page (drafts show as "Work in progress").
  return toSharedTrackContent(row, signed(row.cover_path ?? null))
}

/** Public playlist page data. `tracks` must be in playlist order. */
export function toSharedPlaylist(row: SharedPlaylistRow, tracks: SharedPlaylistTrackRow[], signed: SignedUrls): SharedPlaylist {
  return {
    id: row.id,
    purpose: row.purpose,
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
