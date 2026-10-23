import type { AudioUploadTarget, Genre, PlaybackSource, SharedTrack, TrackDetail, TrackSummary } from '~~/shared/types/track'
import type { AudioUploadRequest, GenreCreate, TrackCreateInput, TrackUpdateInput } from '~~/shared/schemas/track'
import type { PlaylistDetail, PlaylistPurpose, PlaylistSummary, SharedPlaylist } from '~~/shared/types/playlist'
import type { PlaylistCreateInput, PlaylistUpdateInput } from '~~/shared/schemas/playlist'
import type { StorageCleanupResult, StorageReport } from '~~/shared/types/storage'
import type { AnalyticsPeriod, AnalyticsReport } from '~~/shared/types/analytics'

/**
 * Typed client for the server API. The only place where the frontend
 * knows the backend URLs.
 *
 * `$fetch` (ofetch) sends the session cookies, parses JSON and throws on
 * non-2xx responses; the error's `data.message` is the server's message
 * (see app/utils/errors.ts). Response types are the shared domain types.
 */

/** The user's library (sign-in required). */
export const tracksApi = {
  list: () => $fetch<TrackSummary[]>('/api/tracks'),
  get: (id: string) => $fetch<TrackDetail>(`/api/tracks/${id}`),
  uploadUrl: (body: AudioUploadRequest) => $fetch<AudioUploadTarget>('/api/tracks/upload-url', { method: 'POST', body }),
  create: (body: TrackCreateInput) => $fetch<TrackDetail>('/api/tracks', { method: 'POST', body }),
  update: (id: string, body: TrackUpdateInput) => $fetch<TrackDetail>(`/api/tracks/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => $fetch<null>(`/api/tracks/${id}`, { method: 'DELETE' }),
  playback: (id: string) => $fetch<PlaybackSource>(`/api/tracks/${id}/playback`),
}

/** The user's playlists and groups of versions (sign-in required). */
export const playlistsApi = {
  /** One purpose only: curated playlists ('playlist') or groups of versions ('versions'). */
  list: (purpose: PlaylistPurpose) => $fetch<PlaylistSummary[]>('/api/playlists', { query: { purpose } }),
  get: (id: string) => $fetch<PlaylistDetail>(`/api/playlists/${id}`),
  create: (body: PlaylistCreateInput) => $fetch<PlaylistDetail>('/api/playlists', { method: 'POST', body }),
  update: (id: string, body: PlaylistUpdateInput) => $fetch<PlaylistDetail>(`/api/playlists/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => $fetch<null>(`/api/playlists/${id}`, { method: 'DELETE' }),
  /** Replaces the tracks, in order (reorder and remove). */
  setTracks: (id: string, trackIds: string[]) =>
    $fetch<PlaylistDetail>(`/api/playlists/${id}/tracks`, { method: 'PUT', body: { trackIds } }),
  /** Appends tracks; those already in the playlist are skipped. */
  addTracks: (id: string, trackIds: string[]) =>
    $fetch<PlaylistDetail>(`/api/playlists/${id}/tracks`, { method: 'POST', body: { trackIds } }),
}

/** Public endpoints of shared (unlisted/public) tracks and playlists: no sign-in needed. */
export const sharedApi = {
  get: (id: string) => $fetch<SharedTrack>(`/api/shared/${id}`),
  playback: (id: string) => $fetch<PlaybackSource>(`/api/shared/${id}/playback`),
  playlist: (id: string) => $fetch<SharedPlaylist>(`/api/shared/playlists/${id}`),
  playlistTrackPlayback: (playlistId: string, trackId: string) =>
    $fetch<PlaybackSource>(`/api/shared/playlists/${playlistId}/tracks/${trackId}/playback`),
}

/** Storage usage and clean-up of orphaned files (sign-in required). */
export const storageApi = {
  report: () => $fetch<StorageReport>('/api/storage'),
  cleanOrphans: () => $fetch<StorageCleanupResult>('/api/storage/orphans', { method: 'DELETE' }),
}

/** Visits to the user's share pages, Statistics page (sign-in required). */
export const analyticsApi = {
  report: (days: AnalyticsPeriod) => $fetch<AnalyticsReport>('/api/analytics', { query: { days } }),
}

/** Built-in and custom genres (sign-in required). */
export const genresApi = {
  list: () => $fetch<Genre[]>('/api/genres'),
  create: (body: GenreCreate) => $fetch<Genre>('/api/genres', { method: 'POST', body }),
}
