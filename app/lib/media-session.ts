/**
 * Media Session API: controls and metadata on the lock screen, in phone
 * notifications and on keyboard media keys.
 */

export interface MediaSessionTrack {
  title: string
  artist: string | null
  album: string | null
  artworkUrl: string | null
}

export interface MediaSessionHandlers {
  play: () => void
  pause: () => void
  stop: () => void
  previous: () => void
  next: () => void
  seekTo: (seconds: number) => void
}

function supported(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator
}

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

export function setMediaSessionHandlers(handlers: MediaSessionHandlers): void {
  if (!supported()) return
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

export function setMediaSessionPlaybackState(state: MediaSessionPlaybackState): void {
  if (supported()) navigator.mediaSession.playbackState = state
}

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
