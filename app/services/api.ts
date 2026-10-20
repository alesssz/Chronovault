import type { AudioUploadTarget, Genre, PlaybackSource, SharedTrack, TrackDetail, TrackSummary } from '~~/shared/types/track'
import type { AudioUploadRequest, GenreCreate, TrackCreateInput, TrackUpdateInput } from '~~/shared/schemas/track'

/**
 * Typed client for the server API. The only place where the frontend
 * knows the backend URLs.
 */

export const tracksApi = {
  list: () => $fetch<TrackSummary[]>('/api/tracks'),
  get: (id: string) => $fetch<TrackDetail>(`/api/tracks/${id}`),
  uploadUrl: (body: AudioUploadRequest) => $fetch<AudioUploadTarget>('/api/tracks/upload-url', { method: 'POST', body }),
  create: (body: TrackCreateInput) => $fetch<TrackDetail>('/api/tracks', { method: 'POST', body }),
  update: (id: string, body: TrackUpdateInput) => $fetch<TrackDetail>(`/api/tracks/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => $fetch<null>(`/api/tracks/${id}`, { method: 'DELETE' }),
  playback: (id: string) => $fetch<PlaybackSource>(`/api/tracks/${id}/playback`),
}

/** Public endpoints of shared (unlisted/public) tracks: no sign-in needed. */
export const sharedApi = {
  get: (id: string) => $fetch<SharedTrack>(`/api/shared/${id}`),
  playback: (id: string) => $fetch<PlaybackSource>(`/api/shared/${id}/playback`),
}

export const genresApi = {
  list: () => $fetch<Genre[]>('/api/genres'),
  create: (body: GenreCreate) => $fetch<Genre>('/api/genres', { method: 'POST', body }),
}
