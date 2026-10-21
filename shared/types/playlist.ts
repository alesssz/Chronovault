/**
 * Playlist domain types shared by client and server (camelCase).
 * Rows are converted by server/mappers/playlist.ts.
 *
 *   PlaylistSummary → Playlists page (cards)
 *   PlaylistDetail  → playlist page (owner)
 *   SharedPlaylist  → public playlist page /p/:id (anyone with the link)
 */
import type { SharedTrackContent, TrackSummary, TrackVisibility } from './track'

/** Most covers shown in a playlist's automatic mosaic (2×2). */
export const MOSAIC_SIZE = 4

/** Lightweight playlist data for lists. */
export interface PlaylistSummary {
  id: string
  title: string
  description: string | null
  visibility: TrackVisibility
  /** Custom cover, when the owner uploaded one (/api/covers/playlists/:id?v=…, cached). */
  coverUrl: string | null
  /**
   * Cover addresses (/api/covers/tracks/…) of the first tracks that have one, for the automatic
   * mosaic (up to MOSAIC_SIZE). The UI shows a 2×2 grid only with 4 covers,
   * otherwise the first one alone (see PlaylistCover.vue).
   */
  mosaic: string[]
  trackCount: number
  /** Sum of the tracks' durations, in seconds. */
  durationSeconds: number
  createdAt: string
  updatedAt: string
}

/** A playlist with its tracks, in order. */
export interface PlaylistDetail extends PlaylistSummary {
  /** Storage key of the custom cover (owner only). */
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
  /** Signed Storage URLs (6 h): visitors cannot use the owner-only /api/covers. */
  coverUrl: string | null
  mosaic: string[]
  durationSeconds: number
  updatedAt: string
  /** In playlist order. Track visibility is not exposed: visitors don't need it. */
  tracks: SharedTrackContent[]
}
