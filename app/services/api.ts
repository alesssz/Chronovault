import type { AudioUploadTarget, Genre, PlaybackSource, SharedTrack, TrackDetail, TrackMetadata, TrackSummary } from '~~/shared/types/track'
import type { AudioUploadRequest, GenreCreate, TrackCreateInput, TrackUpdateInput } from '~~/shared/schemas/track'
import type {
  PlaylistDetail, PlaylistPurpose, PlaylistSummary, SharedPlaylist, UnseenFeedback, VersionFeedback, VersionVoteState,
} from '~~/shared/types/playlist'
import type { PlaylistCreateInput, PlaylistUpdateInput } from '~~/shared/schemas/playlist'
import type { StorageCleanupResult, StorageReport } from '~~/shared/types/storage'
import type { AnalyticsPeriod, AnalyticsReport, PlaysReport } from '~~/shared/types/analytics'
import type { FeedbackSeenInput, PlayRecordInput, VersionVoteInput } from '~~/shared/schemas/feedback'

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
  /** Every metadata field of every track, long texts included (the metadata export and import). */
  metadata: () => $fetch<TrackMetadata[]>('/api/tracks/metadata'),
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
  /** Votes, plays and comments of a group of versions (Versions page). */
  feedback: (id: string) => $fetch<VersionFeedback>(`/api/playlists/${id}/feedback`),
  /** Feedback that came after the owner's last visit to each group (dot on "Versions", card badges). */
  unseenFeedback: () => $fetch<UnseenFeedback>('/api/feedback/unseen'),
  /**
   * Records the owner's visit to a group (sent when leaving its page), seen
   * up to `at` (the `asOf` of the feedback on screen). `keepalive`: the
   * request is completed even if the page is closing.
   */
  markFeedbackSeen: (id: string, at: string) =>
    $fetch<null>(`/api/playlists/${id}/feedback/seen`, { method: 'POST', body: { at } satisfies FeedbackSeenInput, keepalive: true }),
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
  /** A group's vote state for this browser (`voter`: app/lib/listener-id.ts). */
  voteState: (playlistId: string, voter: string) =>
    $fetch<VersionVoteState>(`/api/shared/playlists/${playlistId}/vote`, { query: { voter } }),
  /** Picks (or changes) this browser's preferred version, with an optional name and comment. */
  vote: (playlistId: string, body: VersionVoteInput) =>
    $fetch<VersionVoteState>(`/api/shared/playlists/${playlistId}/vote`, { method: 'PUT', body }),
  /** Takes this browser's pick back. */
  withdrawVote: (playlistId: string, voter: string) =>
    $fetch<VersionVoteState>(`/api/shared/playlists/${playlistId}/vote`, { method: 'DELETE', query: { voter } }),
}

/** Plays counted by the player (share pages and the library; no sign-in needed). */
export const playsApi = {
  record: (body: PlayRecordInput) => $fetch<null>('/api/plays', { method: 'POST', body }),
}

/** Storage usage and clean-up of orphaned files (sign-in required). */
export const storageApi = {
  report: () => $fetch<StorageReport>('/api/storage'),
  cleanOrphans: () => $fetch<StorageCleanupResult>('/api/storage/orphans', { method: 'DELETE' }),
}

/** Visits to the user's share pages, Statistics page (sign-in required). */
export const analyticsApi = {
  report: (days: AnalyticsPeriod) => $fetch<AnalyticsReport>('/api/analytics', { query: { days } }),
  /** Plays of the user's tracks (counted by the app itself, not by Vercel). */
  plays: (days: AnalyticsPeriod) => $fetch<PlaysReport>('/api/analytics/plays', { query: { days } }),
}

/** Built-in and custom genres (sign-in required). */
export const genresApi = {
  list: () => $fetch<Genre[]>('/api/genres'),
  create: (body: GenreCreate) => $fetch<Genre>('/api/genres', { method: 'POST', body }),
}
