import { APP_NAME, FALLBACK_COVER } from '~~/shared/brand'
import { clamp } from '~~/shared/utils/numbers'

/**
 * Media Session API: controls and metadata on the lock screen, in phone
 * notifications and on keyboard media keys.
 *
 * Thin, defensive wrappers: every call is a no-op where the API (or a
 * specific action) is not supported. Wired to the player store by
 * app/plugins/media-session.client.ts.
 */

/** What the media card shows of a track. */
export interface MediaSessionTrack {
  /** The track's title. */
  title: string
  /** Who wrote it (null: the app's name is shown instead). */
  artist: string | null
  /** The album (null: the app's name is shown instead). */
  album: string | null
  /** Its cover's address, or null for the fallback artwork. */
  artworkUrl: string | null
}

/** What the OS controls do: wired to the player store. */
export interface MediaSessionHandlers {
  /** Play (the lock-screen button, a media key). */
  play: () => void
  /** Pause. */
  pause: () => void
  /** Stop (some systems offer it). */
  stop: () => void
  /** Previous track. */
  previous: () => void
  /** Next track. */
  next: () => void
  /** Move to a position, in seconds (the progress bar). */
  seekTo: (seconds: number) => void
}

/** False on the server and in browsers without the API. */
function supported(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator
}

/**
 * The artwork for tracks without a cover: the Chronovault artwork, the same
 * fallback cover the app shows (without any artwork Android shows an empty or
 * generic tile on the lock screen). A WebP square, like the uploaded covers.
 */
const FALLBACK_ARTWORK: MediaImage[] = [
  { src: FALLBACK_COVER.app, sizes: `${FALLBACK_COVER.size}x${FALLBACK_COVER.size}`, type: 'image/webp' },
]

/**
 * Absolute form of an image address. Cover addresses are relative
 * (`/api/covers/…`); the artwork is fetched by the browser for the system's
 * media card, outside the page, so the full address avoids any doubt about
 * what it is relative to.
 */
function absolute(src: string): string {
  return new URL(src, window.location.href).href
}

/**
 * Shows the track (or nothing) on the lock screen and in the media
 * notification. Covers are 800×800 WebP; a track without one shows the
 * Chronovault artwork, and a missing artist or album reads "Chronovault"
 * (APP_NAME), so the card always shows the track and whose music it is.
 */
export function setMediaSessionTrack(track: MediaSessionTrack | null): void {
  if (!supported()) return
  // The cover in the uploaded format, or the fallback artwork.
  const artwork = track?.artworkUrl
    ? [{ src: track.artworkUrl, sizes: '800x800', type: 'image/webp' }]
    : FALLBACK_ARTWORK
  navigator.mediaSession.metadata = track
    ? new MediaMetadata({
        title: track.title,
        artist: track.artist || APP_NAME,
        album: track.album || APP_NAME,
        artwork: artwork.map(image => ({ ...image, src: absolute(image.src) })),
      })
    : null
}

/** Routes hardware/OS media controls to the player. */
export function setMediaSessionHandlers(handlers: MediaSessionHandlers): void {
  if (!supported()) return
  // Registers one action, ignoring the ones this browser does not know.
  const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler)
    }
    catch {
      // Action not supported by this browser.
    }
  }
  set('play', () => handlers.play())
  set('pause', () => handlers.pause())
  set('stop', () => handlers.stop())
  set('previoustrack', () => handlers.previous())
  set('nexttrack', () => handlers.next())
  set('seekto', (details) => {
    if (details.seekTime != null) handlers.seekTo(details.seekTime)
  })
}

/** Tells the OS whether audio is playing (play/pause icon). */
export function setMediaSessionPlaybackState(state: MediaSessionPlaybackState): void {
  if (supported()) navigator.mediaSession.playbackState = state
}

/**
 * Updates the lock-screen progress bar. The OS extrapolates the position
 * from `playbackRate`, so this only needs calling on changes and now and then.
 */
export function setMediaSessionPosition(duration: number, position: number, playbackRate = 1): void {
  if (!supported() || !navigator.mediaSession.setPositionState) return
  if (!Number.isFinite(duration) || duration <= 0) return
  try {
    navigator.mediaSession.setPositionState({
      duration,
      position: clamp(position, 0, duration),
      playbackRate,
    })
  }
  catch {
    // Inconsistent values while switching tracks: ignore.
  }
}
