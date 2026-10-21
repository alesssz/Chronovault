/**
 * Media Session API: controls and metadata on the lock screen, in phone
 * notifications and on keyboard media keys.
 *
 * Thin, defensive wrappers: every call is a no-op where the API (or a
 * specific action) is not supported. Wired to the player store by
 * app/plugins/media-session.client.ts.
 */

export interface MediaSessionTrack {
  title: string
  artist: string | null
  album: string | null
  artworkUrl: string | null
}

/** What the OS controls do: wired to the player store. */
export interface MediaSessionHandlers {
  play: () => void
  pause: () => void
  stop: () => void
  previous: () => void
  next: () => void
  seekTo: (seconds: number) => void
}

/** False on the server and in browsers without the API. */
function supported(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator
}

/** Shows the track (or nothing) on the lock screen / notification. Covers are 800×800 WebP. */
export function setMediaSessionTrack(track: MediaSessionTrack | null): void {
  if (!supported()) return
  navigator.mediaSession.metadata = track
    ? new MediaMetadata({
        title: track.title,
        artist: track.artist ?? '',
        album: track.album ?? '',
        artwork: track.artworkUrl ? [{ src: track.artworkUrl, sizes: '800x800', type: 'image/webp' }] : [],
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
      position: Math.min(Math.max(0, position), duration),
      playbackRate,
    })
  }
  catch {
    // Inconsistent values while switching tracks: ignore.
  }
}
