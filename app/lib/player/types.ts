/**
 * Types of the player, shared by its parts (app/lib/player/*) and by the
 * store that puts them together (app/stores/player.ts), which re-exports
 * them: components import them from `~/stores/player`.
 */
import type { TrackDetail, TrackSummary } from '~~/shared/types/track'

/**
 * - `idle`: nothing loaded, the player bar is hidden;
 * - `loading`: fetching track data and a streaming URL;
 * - `playing` / `paused`: a track is loaded in the engine;
 * - `error`: the last load or resume failed (`error` holds the message).
 */
export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

/**
 * Outcome of "Play next" / "Add to queue", for the toast:
 * - `started`: nothing from the library was playing, so the track started;
 * - `queued`: added (or moved) to the requested place;
 * - `current`: it is the track already playing, nothing changed;
 * - `already-queued`: "Add to queue" on a track already coming up, nothing changed.
 */
export type QueueResult = 'started' | 'queued' | 'current' | 'already-queued'

/** What happens at the end of a track: carry on and stop after the last one, loop the queue, or repeat the track. */
export type RepeatMode = 'off' | 'all' | 'one'

/** A queued track: what the player bar shows while the full data loads. */
export type QueueItem = Pick<TrackSummary, 'id' | 'title' | 'composers' | 'album' | 'year' | 'durationSeconds' | 'coverUrl'>
  & Partial<Pick<TrackSummary, 'genreId'>>

/**
 * The track being played: a library track or a shared one (public page).
 * Every source provides these fields (TrackDetail and the shared tracks
 * alike); the description is shown under the controls of the phones'
 * full-screen view. Shared tracks also carry their genre's name (`genre`):
 * visitors cannot look a `genreId` up in the owner's genre list.
 */
export type PlayerTrack = QueueItem & Pick<TrackDetail, 'lyrics' | 'lyricsSynced' | 'peaks' | 'description'>
  & { genre?: string | null }
