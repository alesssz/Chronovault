/**
 * setMediaSessionTrack: what the lock screen and the media notification show.
 * The track's cover when it has one, otherwise the Chronovault artwork (the
 * fallback cover); the app's name where the artist or album is missing;
 * artwork addresses made absolute.
 * The browser's Media Session API is replaced by stand-ins.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setMediaSessionTrack } from '~/lib/media-session'
import { APP_NAME } from '~~/shared/brand'

/** Records what MediaMetadata was built with (the real one only exists in browsers). */
class FakeMediaMetadata {
  constructor(public init: MediaMetadataInit) {}
}

/** The stand-in for navigator.mediaSession: setMediaSessionTrack writes `metadata` on it. */
let session: { metadata: FakeMediaMetadata | null }

describe('setMediaSessionTrack', () => {
  beforeEach(() => {
    session = { metadata: null }
    vi.stubGlobal('navigator', { mediaSession: session })
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    vi.stubGlobal('window', { location: { href: 'https://chrono.example/tracks' } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the cover, artist and album of a complete track', () => {
    setMediaSessionTrack({ title: 'Night drive', artist: 'Chronovault', album: 'Roads', artworkUrl: '/api/covers/tracks/1?v=a' })
    expect(session.metadata!.init).toEqual({
      title: 'Night drive',
      artist: 'Chronovault',
      album: 'Roads',
      artwork: [{ src: 'https://chrono.example/api/covers/tracks/1?v=a', sizes: '800x800', type: 'image/webp' }],
    })
  })

  it('falls back to the artwork and the app name, so the card always shows whose music it is', () => {
    setMediaSessionTrack({ title: 'Untitled demo', artist: null, album: '', artworkUrl: null })
    // What the card was built with.
    const init = session.metadata!.init
    expect(init.artist).toBe('Chronovault')
    expect(init.album).toBe(APP_NAME)
    expect(init.artwork).toEqual([
      { src: 'https://chrono.example/cover-fallback.webp', sizes: '800x800', type: 'image/webp' },
    ])
  })

  it('keeps absolute cover addresses as they are (public pages use signed URLs)', () => {
    setMediaSessionTrack({ title: 'Shared', artist: 'A', album: 'B', artworkUrl: 'https://storage.example/cover.webp?token=x' })
    expect(session.metadata!.init.artwork![0]!.src).toBe('https://storage.example/cover.webp?token=x')
  })

  it('clears the card when nothing is loaded', () => {
    setMediaSessionTrack({ title: 'Something', artist: null, album: null, artworkUrl: null })
    setMediaSessionTrack(null)
    expect(session.metadata).toBeNull()
  })
})
