import type { SharedTrackContent, TrackSummary, TrackVisibility } from './track'

/** Most covers shown in a playlist's automatic mosaic. */
export const MOSAIC_SIZE = 4

/** Lightweight playlist data for lists. */
export interface PlaylistSummary {
  id: string
  title: string
  description: string | null
  visibility: TrackVisibility
  /** Custom cover, when the owner uploaded one. */
  coverUrl: string | null
  /** Covers of the first tracks, for the automatic mosaic (up to MOSAIC_SIZE). */
  mosaic: string[]
  trackCount: number
  durationSeconds: number
  createdAt: string
  updatedAt: string
}

/** A playlist with its tracks, in order. */
export interface PlaylistDetail extends PlaylistSummary {
  coverPath: string | null
  tracks: TrackSummary[]
  /** How many of the tracks are private (they become audible when the playlist is shared). */
  privateTrackCount: number
}

/**
 * What anyone with the link sees of an 'unlisted' or 'public' playlist.
 * Sharing a playlist shares all its tracks, private ones included, but
 * never the Suno prompt, the mastering status or storage paths.
 */
export interface SharedPlaylist {
  id: string
  title: string
  description: string | null
  visibility: Exclude<TrackVisibility, 'private'>
  coverUrl: string | null
  mosaic: string[]
  durationSeconds: number
  updatedAt: string
  tracks: SharedTrackContent[]
}
