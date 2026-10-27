/**
 * Player store with a fake audio engine and a mocked API: queue, previous/next, toggling,
 * race conditions between loads, expired signed URLs (refresh before resume/seek, one retry
 * after a refusal), playback rate, the shared sources (public track and playlist pages), and the
 * next track asked for ahead (so it starts at once when the current one ends).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { SharedTrack, TrackDetail, TrackSummary } from '~~/shared/types/track'
import type { SharedPlaylist } from '~~/shared/types/playlist'
import { setAudioEngine, type AudioEngineEvents, type PlaybackEngine } from '~/lib/audio-engine'
import { sharedApi, tracksApi } from '~/services/api'
import { usePlayerStore } from '~/stores/player'

vi.mock('~/services/api', () => ({
  tracksApi: { get: vi.fn(), playback: vi.fn() },
  sharedApi: { get: vi.fn(), playback: vi.fn(), playlist: vi.fn(), playlistTrackPlayback: vi.fn() },
  genresApi: {},
}))

/** Fake audio engine: records calls and lets tests simulate events. */
class FakeEngine implements PlaybackEngine {
  readonly element = null
  currentTime = 0
  duration = 0
  src: string | null = null
  volume = 1
  muted = false
  private handlers = new Map<string, Set<(...args: unknown[]) => void>>()

  // Adds a listener; returns the function that removes it, like the real engine.
  on<K extends keyof AudioEngineEvents>(event: K, listener: AudioEngineEvents[K]) {
    // This event's listeners (a new set on first use).
    const set = this.handlers.get(event) ?? new Set()
    set.add(listener as (...args: unknown[]) => void)
    this.handlers.set(event, set)
    return () => set.delete(listener as (...args: unknown[]) => void)
  }

  /** Test helper: fires an engine event as if the <audio> element had. */
  emit(event: keyof AudioEngineEvents, ...args: unknown[]) {
    this.handlers.get(event)?.forEach(h => h(...args))
  }

  load = vi.fn((src: string) => {
    this.src = src
    this.currentTime = 0
  })

  unload = vi.fn(() => {
    this.src = null
    this.currentTime = 0
  })

  play = vi.fn(async () => this.emit('play'))
  pause = vi.fn(() => this.emit('pause'))
  stop = vi.fn(() => {
    this.emit('pause')
    this.currentTime = 0
  })

  seek = vi.fn((t: number) => {
    this.currentTime = t
  })

  setVolume = vi.fn((v: number) => {
    this.volume = v
  })

  setMuted = vi.fn((m: boolean) => {
    this.muted = m
  })

  rate = 1
  setPlaybackRate = vi.fn((r: number) => {
    this.rate = r
  })
}

/**
 * The next play() behaves like a browser still buffering: 'play' fires at
 * once, but the promise only settles when the audio starts, and a pause()
 * before that rejects it with an AbortError.
 */
function startSlowly() {
  engine.play.mockImplementationOnce(() => new Promise<void>((_, reject) => {
    engine.emit('play')
    engine.pause.mockImplementationOnce(() => {
      engine.emit('pause')
      reject(new DOMException('The play() request was interrupted by a call to pause().', 'AbortError'))
    })
  }))
}

/** A library item with the given id (120 s, no cover). */
function summary(id: string): TrackSummary {
  return {
    id, title: `Track ${id}`, composers: null, album: null, year: null, genreId: null, mastered: false,
    visibility: 'private', durationSeconds: 120, hasLyrics: false, hasSyncedLyrics: false, coverUrl: null,
    createdAt: '', updatedAt: '',
  }
}

/** The full data the API returns for `summary(id)`. */
function detail(id: string): TrackDetail {
  return {
    ...summary(id), description: null, sunoPrompt: null, lyrics: null, lyricsSynced: null,
    peaks: null, mimeType: 'audio/mpeg', sizeBytes: 1, audioPath: `u/${id}.mp3`, coverPath: null,
  }
}

/** A track of a shared playlist (shareable fields only). */
function sharedPlaylistTrack(id: string) {
  return {
    id, title: `Shared ${id}`, composers: null, album: null, year: null, genre: null, description: null,
    lyrics: null, lyricsSynced: null, peaks: null, durationSeconds: 60, coverUrl: null, updatedAt: '',
  }
}

/** A shared playlist of three tracks: x, y, z. */
const sharedPlaylist: SharedPlaylist = {
  id: 'p', title: 'Night drive', description: null, visibility: 'unlisted', coverUrl: null, mosaic: [],
  durationSeconds: 180, updatedAt: '', tracks: ['x', 'y', 'z'].map(sharedPlaylistTrack),
}

/** The library shown on screen: a, b, c (queue context of most tests). */
const library = ['a', 'b', 'c'].map(summary)
/** A fresh fake engine for every test. */
let engine: FakeEngine

/** Lifetime of a signed URL, in ms (as the server issues them). */
const SIX_HOURS = 6 * 60 * 60 * 1000

beforeEach(() => {
  setActivePinia(createPinia())
  engine = new FakeEngine()
  setAudioEngine(engine)
  vi.mocked(tracksApi.get).mockImplementation(async id => detail(id))
  // Signed URLs like the server's: valid for six hours from now.
  vi.mocked(tracksApi.playback).mockImplementation(async id => ({
    url: `https://audio/${id}`,
    expiresAt: new Date(Date.now() + SIX_HOURS).toISOString(),
  }))
  vi.mocked(sharedApi.playback).mockImplementation(async id => ({
    url: `https://shared-audio/${id}`,
    expiresAt: new Date(Date.now() + SIX_HOURS).toISOString(),
  }))
  vi.mocked(sharedApi.playlistTrackPlayback).mockImplementation(async (playlistId, id) => ({
    url: `https://playlist-audio/${playlistId}/${id}`,
    expiresAt: new Date(Date.now() + SIX_HOURS).toISOString(),
  }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('player store', () => {
  it('starts idle', () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    expect(player.status).toBe('idle')
    expect(player.isActive).toBe(false)
  })

  it('plays a track using the library as the queue', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[1]!, library)

    expect(engine.load).toHaveBeenCalledWith('https://audio/b')
    expect(engine.play).toHaveBeenCalled()
    expect(player.status).toBe('playing')
    expect(player.current?.id).toBe('b')
    expect(player.index).toBe(1)
    expect(player.hasNext).toBe(true)
    expect(player.hasPrevious).toBe(true)
  })

  it('clicking the current track again pauses and resumes it', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)
    await player.playTrack(library[0]!, library)
    expect(player.status).toBe('paused')
    expect(engine.load).toHaveBeenCalledTimes(1)

    await player.playTrack(library[0]!, library)
    expect(player.status).toBe('playing')
  })

  it('moves to the next track when one ends and stops at the end of the queue', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[1]!, library)

    engine.emit('ended')
    await vi.waitFor(() => expect(player.current?.id).toBe('c'))

    engine.emit('ended')
    expect(player.status).toBe('paused')
    expect(player.current?.id).toBe('c')
  })

  it('"previous" restarts an advanced track, otherwise goes back', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[1]!, library)

    engine.emit('time', 42)
    await player.previous()
    expect(engine.seek).toHaveBeenLastCalledWith(0)
    expect(player.current?.id).toBe('b')

    engine.emit('time', 1)
    await player.previous()
    expect(player.current?.id).toBe('a')
  })

  it('ignores responses of a load superseded by a newer one', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    // Resolves the slow request by hand, after a newer load has started.
    let releaseSlow!: () => void
    vi.mocked(tracksApi.get).mockImplementationOnce(id => new Promise((resolve) => {
      releaseSlow = () => resolve(detail(id))
    }))

    // The first click, whose data comes back last.
    const slow = player.playTrack(library[0]!, library)
    await player.playTrack(library[2]!, library)
    releaseSlow()
    await slow

    expect(player.current?.id).toBe('c')
    expect(engine.load).toHaveBeenCalledTimes(1)
    expect(engine.load).toHaveBeenCalledWith('https://audio/c')
  })

  it('shows an error when the track fails to load', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    vi.mocked(tracksApi.playback).mockRejectedValueOnce({ data: { message: 'Track not found' } })

    await player.playTrack(library[0]!, library)

    expect(player.status).toBe('error')
    expect(player.error).toBe('Track not found')
  })

  it('clamps the volume to 0..1 and raising it unmutes', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)

    player.toggleMute()
    expect(engine.muted).toBe(true)

    player.setVolume(1.5)
    expect(player.volume).toBe(1)
    expect(engine.muted).toBe(false)
  })

  it('stop rewinds to the start and pauses', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)
    engine.emit('time', 30)

    player.stop()

    expect(engine.stop).toHaveBeenCalled()
    expect(player.currentTime).toBe(0)
    expect(player.status).toBe('paused')
  })

  it('changes the playback speed within limits', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)

    player.setPlaybackRate(0.75)
    expect(player.playbackRate).toBe(0.75)
    expect(engine.rate).toBe(0.75)

    player.setPlaybackRate(10)
    expect(player.playbackRate).toBe(2)
    player.setPlaybackRate(0)
    expect(player.playbackRate).toBe(0.25)
  })

  it('closing the player restores the normal speed', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)
    player.setPlaybackRate(0.5)

    player.close()

    expect(player.playbackRate).toBe(1)
    expect(engine.rate).toBe(1)
  })

  it('closing the player drops the audio source', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)

    player.close()

    expect(engine.unload).toHaveBeenCalled()
    expect(player.status).toBe('idle')
  })

  it('deleting the playing track closes the player', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[1]!, library)

    player.removeTrack('a')
    expect(player.index).toBe(0)
    expect(player.queue.map(t => t.id)).toEqual(['b', 'c'])

    player.removeTrack('b')
    expect(player.status).toBe('idle')
    expect(player.current).toBeNull()
  })

  it('the expanded view only opens with an active track', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    player.setExpanded(true)
    expect(player.expanded).toBe(false)

    await player.playTrack(library[0]!, library)
    player.setExpanded(true)
    expect(player.expanded).toBe(true)
  })

  it('refreshes title and details after an edit in the editor', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)

    player.syncTrack({ ...detail('a'), title: 'New title' })

    expect(player.current?.title).toBe('New title')
    expect(player.queue[0]?.title).toBe('New title')
    expect(player.queue[0]).not.toHaveProperty('audioPath')
  })

  it('shows the track being loaded, not the one before it, and keeps showing it when its load fails', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)
    expect(player.displayTrack?.id).toBe('a')

    // b's data takes a while to come, then fails.
    let failLoad!: (reason: unknown) => void
    vi.mocked(tracksApi.get).mockImplementationOnce(() => new Promise((_, reject) => {
      failLoad = reject
    }))
    // The move to b, still loading.
    const moving = player.next()

    // While b loads: b is shown (its summary from the queue), not a's full data still in `current`.
    expect(player.status).toBe('loading')
    expect(player.current?.id).toBe('a')
    expect(player.displayTrack?.id).toBe('b')

    failLoad({ data: { message: 'Track not found' } })
    await moving
    // The error belongs to b, and b is what the player shows with it.
    expect(player.status).toBe('error')
    expect(player.displayTrack?.id).toBe('b')
  })
})

describe('expired or refused audio sources', () => {
  it('resuming after the signed URL expired loads a fresh one at the same position', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)
    engine.emit('time', 42)
    engine.currentTime = 42
    player.pause()

    vi.setSystemTime(Date.now() + SIX_HOURS + 60_000)
    await player.play()

    expect(tracksApi.playback).toHaveBeenCalledTimes(2)
    expect(engine.load).toHaveBeenCalledTimes(2)
    expect(engine.seek).toHaveBeenLastCalledWith(42)
    expect(player.status).toBe('playing')
  })

  it('resuming before expiry reuses the loaded source', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)
    player.pause()

    await player.play()

    expect(tracksApi.playback).toHaveBeenCalledTimes(1)
    expect(engine.load).toHaveBeenCalledTimes(1)
  })

  it('seeking after expiry reloads the source at the new position and keeps playing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)

    vi.setSystemTime(Date.now() + SIX_HOURS + 60_000)
    player.seek(90)

    await vi.waitFor(() => expect(engine.load).toHaveBeenCalledTimes(2))
    expect(engine.seek).toHaveBeenLastCalledWith(90)
    await vi.waitFor(() => expect(engine.play).toHaveBeenCalledTimes(2))
    expect(player.status).toBe('playing')
  })

  it('a source refused during playback is reloaded once, then the error is shown', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)
    engine.currentTime = 10

    engine.emit('error', 'Network error while loading the audio')
    await vi.waitFor(() => expect(engine.load).toHaveBeenCalledTimes(2))
    expect(engine.seek).toHaveBeenLastCalledWith(10)
    expect(player.status).toBe('playing')

    // Fails again before any audio played: give up and show the error.
    engine.emit('error', 'Network error while loading the audio')
    await vi.waitFor(() => expect(player.status).toBe('error'))
    expect(player.error).toBe('Network error while loading the audio')
    expect(engine.load).toHaveBeenCalledTimes(2)
  })

  it('a source that recovers can be reloaded again later', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)

    engine.emit('error', 'Network error while loading the audio')
    await vi.waitFor(() => expect(engine.load).toHaveBeenCalledTimes(2))
    engine.emit('buffering', false) // audio is flowing again

    engine.emit('error', 'Network error while loading the audio')
    await vi.waitFor(() => expect(engine.load).toHaveBeenCalledTimes(3))
    expect(player.status).toBe('playing')
  })

  it('the first play of a track is retried once with a fresh URL', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    engine.play.mockRejectedValueOnce(new DOMException('Failed to load because no supported source was found.', 'NotSupportedError'))

    await player.playTrack(library[0]!, library)

    expect(tracksApi.playback).toHaveBeenCalledTimes(2)
    expect(player.status).toBe('playing')
  })

  it('a pause before the audio starts is kept: the interrupted first play is not retried', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    startSlowly()

    // Still starting when the pause comes.
    const starting = player.playTrack(library[0]!, library)
    await vi.waitFor(() => expect(player.status).toBe('playing'))
    await player.togglePlay()
    await starting

    expect(player.status).toBe('paused')
    expect(engine.play).toHaveBeenCalledTimes(1)
    expect(tracksApi.playback).toHaveBeenCalledTimes(1)
  })

  it('a pause before a resumed track starts is kept too', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)
    await player.togglePlay()
    startSlowly()

    // Resuming, still starting when the pause comes.
    const resuming = player.togglePlay()
    await vi.waitFor(() => expect(player.status).toBe('playing'))
    await player.togglePlay()
    await resuming

    expect(player.status).toBe('paused')
    expect(engine.play).toHaveBeenCalledTimes(2)
    expect(tracksApi.playback).toHaveBeenCalledTimes(1)
  })

  it('a pause while an expired URL is being replaced shows no error', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)
    player.pause()
    vi.setSystemTime(Date.now() + SIX_HOURS + 60_000)
    startSlowly()

    // Resuming with a fresh address, still starting when the pause comes.
    const resuming = player.play()
    await vi.waitFor(() => expect(player.status).toBe('playing'))
    player.pause()
    await resuming

    expect(tracksApi.playback).toHaveBeenCalledTimes(2)
    expect(player.status).toBe('paused')
    expect(player.error).toBeNull()
  })

  it('shows the browser error when the retry fails too', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    // What Chrome throws when the audio URL is refused (e.g. expired).
    const refused = new DOMException('Failed to load because no supported source was found.', 'NotSupportedError')
    engine.play.mockRejectedValueOnce(refused).mockRejectedValueOnce(refused)

    await player.playTrack(library[0]!, library)

    expect(player.status).toBe('error')
    expect(player.error).toBe('Failed to load because no supported source was found.')
  })

  describe('shared tracks (public page)', () => {
    /** A track as the public track page receives it. */
    const shared: SharedTrack = {
      id: 's', title: 'Shared', composers: null, album: null, year: null, genre: 'Ambient', description: null,
      lyrics: null, lyricsSynced: null, peaks: [0.5], durationSeconds: 90, coverUrl: null,
      visibility: 'unlisted', updatedAt: '',
    }

    it('cues a shared track without playing it, using the public API only', async () => {
      // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
      const player = usePlayerStore()
      await player.cueShared(shared)

      expect(engine.load).toHaveBeenCalledWith('https://shared-audio/s')
      expect(engine.play).not.toHaveBeenCalled()
      expect(tracksApi.get).not.toHaveBeenCalled()
      expect(tracksApi.playback).not.toHaveBeenCalled()
      expect(player.status).toBe('paused')
      expect(player.current?.id).toBe('s')
      expect(player.duration).toBe(90)

      await player.togglePlay()
      expect(player.status).toBe('playing')
    })

    it('refreshes an expired URL of a shared track through the public API', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
      const player = usePlayerStore()
      await player.cueShared(shared)

      vi.setSystemTime(Date.now() + SIX_HOURS + 1000)
      await player.play()

      expect(sharedApi.playback).toHaveBeenCalledTimes(2)
      expect(tracksApi.playback).not.toHaveBeenCalled()
      expect(player.status).toBe('playing')
    })

    it('playing from the library afterwards goes back to the library API', async () => {
      // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
      const player = usePlayerStore()
      await player.cueShared(shared)
      await player.playTrack(library[0]!, library)

      expect(engine.load).toHaveBeenLastCalledWith('https://audio/a')
      expect(tracksApi.get).toHaveBeenCalledWith('a')
    })
  })

  describe('shared playlists (public page)', () => {
    // The shared playlist of these tests (x, y, z).
    const playlist = sharedPlaylist

    it('cues the first track through the playlist, without playing', async () => {
      // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
      const player = usePlayerStore()
      await player.playSharedPlaylist(playlist, 0, false)

      expect(engine.load).toHaveBeenCalledWith('https://playlist-audio/p/x')
      expect(engine.play).not.toHaveBeenCalled()
      expect(player.sourceKey).toBe('playlist:p')
      expect(player.status).toBe('paused')
      expect(tracksApi.get).not.toHaveBeenCalled()
    })

    it('plays a chosen track and moves on through the playlist', async () => {
      // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
      const player = usePlayerStore()
      await player.playSharedPlaylist(playlist, 1)
      expect(player.current?.id).toBe('y')
      expect(player.status).toBe('playing')

      engine.emit('ended')
      await vi.waitFor(() => expect(player.current?.id).toBe('z'))
      expect(engine.load).toHaveBeenLastCalledWith('https://playlist-audio/p/z')
    })

    it('choosing the track already loaded toggles play/pause', async () => {
      // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
      const player = usePlayerStore()
      await player.playSharedPlaylist(playlist, 0)
      await player.playSharedPlaylist(playlist, 0)
      expect(player.status).toBe('paused')
      expect(engine.load).toHaveBeenCalledTimes(1)
    })

    it('closing the player goes back to the library source', async () => {
      // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
      const player = usePlayerStore()
      await player.playSharedPlaylist(playlist, 0)
      player.close()
      expect(player.sourceKey).toBe('library')
    })
  })

  describe('editable queue', () => {
    /** The queue as a list of ids, for compact assertions. */
    const ids = (player: ReturnType<typeof usePlayerStore>) => player.queue.map(t => t.id)
    // A track outside the library list, to add to the queue…
    const d = summary('d')
    // …and a second one, for the moves.
    const e = summary('e')

    /** Playing "b" from the library a, b, c. */
    async function playingB() {
      // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
      const player = usePlayerStore()
      await player.playTrack(library[1]!, library)
      return player
    }

    it('play next puts the track right after the current one', async () => {
      // "b" playing from the library a, b, c (see playingB).
      const player = await playingB()
      expect(await player.playNext(d)).toBe('queued')
      expect(ids(player)).toEqual(['a', 'b', 'd', 'c'])
      expect(player.index).toBe(1)
      expect(player.upcoming.map(t => t.id)).toEqual(['d', 'c'])
    })

    it('play next moves a track that is already queued, also one already played', async () => {
      // "b" playing from the library a, b, c (see playingB).
      const player = await playingB()
      await player.playNext(library[2]!)
      expect(ids(player)).toEqual(['a', 'b', 'c'])
      await player.playNext(library[0]!)
      expect(ids(player)).toEqual(['b', 'a', 'c'])
      // The current track did not change.
      expect(player.index).toBe(0)
      expect(player.queue[player.index]!.id).toBe('b')
    })

    it('add to queue appends; tracks coming up or playing stay where they are', async () => {
      // "b" playing from the library a, b, c (see playingB).
      const player = await playingB()
      expect(await player.addToQueue(d)).toBe('queued')
      expect(ids(player)).toEqual(['a', 'b', 'c', 'd'])
      expect(await player.addToQueue(library[2]!)).toBe('already-queued')
      expect(await player.addToQueue(library[1]!)).toBe('current')
      expect(await player.addToQueue(library[0]!)).toBe('queued')
      expect(ids(player)).toEqual(['b', 'c', 'd', 'a'])
      expect(player.index).toBe(0)
    })

    it('when nothing is playing, both start the track', async () => {
      // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
      const player = usePlayerStore()
      expect(await player.addToQueue(d)).toBe('started')
      expect(player.current?.id).toBe('d')
      expect(player.status).toBe('playing')
    })

    it('moves, removes and clears upcoming tracks only', async () => {
      // "b" playing from the library a, b, c (see playingB).
      const player = await playingB()
      await player.addToQueue(d)
      await player.addToQueue(e)
      // a, b, c, d, e — current b at 1
      player.moveInQueue(4, 2)
      expect(ids(player)).toEqual(['a', 'b', 'e', 'c', 'd'])
      // The current and past tracks cannot be moved or removed.
      player.moveInQueue(1, 3)
      player.moveInQueue(0, 3)
      player.removeFromQueue(1)
      player.removeFromQueue(0)
      expect(ids(player)).toEqual(['a', 'b', 'e', 'c', 'd'])

      player.removeFromQueue(3)
      expect(ids(player)).toEqual(['a', 'b', 'e', 'd'])
      player.clearUpcoming()
      expect(ids(player)).toEqual(['a', 'b'])
      expect(player.hasNext).toBe(false)
    })

    it('"next" and the end of a track follow the edited order', async () => {
      // "b" playing from the library a, b, c (see playingB).
      const player = await playingB()
      await player.playNext(d)
      await player.next()
      expect(player.current?.id).toBe('d')
      engine.emit('ended')
      await vi.waitFor(() => expect(player.current?.id).toBe('c'))
    })

    it('plays a queued track right away', async () => {
      // "b" playing from the library a, b, c (see playingB).
      const player = await playingB()
      await player.addToQueue(d)
      await player.playFromQueue(3)
      expect(player.current?.id).toBe('d')
      expect(player.index).toBe(3)
    })

    it('the queue cannot be edited while a public page plays', async () => {
      // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
      const player = usePlayerStore()
      await player.cueShared({
        id: 's', title: 'Shared', composers: null, album: null, year: null, genre: null, description: null,
        lyrics: null, lyricsSynced: null, peaks: null, durationSeconds: 60, coverUrl: null,
        visibility: 'unlisted', updatedAt: '',
      })
      expect(player.queueEditable).toBe(false)
      player.setQueueOpen(true)
      expect(player.queueOpen).toBe(false)
    })
  })

  describe('restoring a saved queue', () => {
    it('loads the saved track paused, at the saved position', async () => {
      // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
      const player = usePlayerStore()
      expect(await player.restoreQueue(library, 1, 42)).toBe(true)

      expect(player.status).toBe('paused')
      expect(engine.play).not.toHaveBeenCalled()
      expect(engine.load).toHaveBeenCalledWith('https://audio/b')
      expect(engine.seek).toHaveBeenCalledWith(42)
      expect(player.currentTime).toBe(42)
      expect(player.queue.map(t => t.id)).toEqual(['a', 'b', 'c'])
      expect(player.index).toBe(1)
      expect(player.queueEditable).toBe(true)
    })

    it('does nothing when something is already playing', async () => {
      // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
      const player = usePlayerStore()
      await player.playTrack(library[2]!, library)
      expect(await player.restoreQueue(library, 0, 10)).toBe(false)
      expect(player.current?.id).toBe('c')
    })

    it('gives up and closes the player when the track cannot be loaded', async () => {
      // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
      const player = usePlayerStore()
      vi.mocked(tracksApi.get).mockRejectedValueOnce(new Error('Track not found'))
      expect(await player.restoreQueue(library, 0, 10)).toBe(false)
      expect(player.status).toBe('idle')
      expect(player.queue).toEqual([])
    })
  })
})

describe('repeat', () => {
  it('starts off and cycles off → all → one → off', () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    expect(player.repeat).toBe('off')
    player.cycleRepeat()
    expect(player.repeat).toBe('all')
    player.cycleRepeat()
    expect(player.repeat).toBe('one')
    player.cycleRepeat()
    expect(player.repeat).toBe('off')
  })

  it('one: a track that ends starts again from 0:00, without a new URL', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)
    player.cycleRepeat()
    player.cycleRepeat()

    engine.emit('ended')
    await vi.waitFor(() => expect(engine.play).toHaveBeenCalledTimes(2))

    expect(engine.seek).toHaveBeenLastCalledWith(0)
    expect(player.index).toBe(0)
    expect(tracksApi.playback).toHaveBeenCalledTimes(1)
  })

  it('one: an expired URL is replaced and the track starts again from 0:00', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)
    player.cycleRepeat()
    player.cycleRepeat()
    engine.currentTime = 120
    vi.setSystemTime(Date.now() + SIX_HOURS + 60_000)

    engine.emit('ended')
    await vi.waitFor(() => expect(engine.play).toHaveBeenCalledTimes(2))

    expect(tracksApi.playback).toHaveBeenCalledTimes(2)
    expect(engine.currentTime).toBe(0)
    expect(player.status).toBe('playing')
  })

  it('one: next and previous still change track, and next stops at the last one', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[1]!, library)
    player.cycleRepeat()
    player.cycleRepeat()

    await player.next()
    expect(player.index).toBe(2)
    expect(player.hasNext).toBe(false)
    await player.previous()
    expect(player.index).toBe(1)
  })

  it('all: after the last track the queue starts again from the first', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[2]!, library)
    player.cycleRepeat()
    expect(player.hasNext).toBe(true)

    engine.emit('ended')
    await vi.waitFor(() => expect(player.current?.id).toBe('a'))
    expect(player.index).toBe(0)
    expect(player.status).toBe('playing')
  })

  it('all: previous on the first track goes to the last one', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)
    player.cycleRepeat()

    await player.previous()
    expect(player.index).toBe(2)
  })

  it('off: the end of the queue stops', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[2]!, library)

    engine.emit('ended')
    expect(player.status).toBe('paused')
    expect(player.index).toBe(2)
  })

  it('all is ignored on public pages: a shared playlist stops at its end', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    player.cycleRepeat()
    await player.playSharedPlaylist(sharedPlaylist, 2)

    expect(player.hasNext).toBe(false)
    engine.emit('ended')
    expect(player.status).toBe('paused')
  })

  it('one is ignored on public pages: a shared track is not played again', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    player.cycleRepeat()
    player.cycleRepeat()
    await player.playSharedPlaylist(sharedPlaylist, 2)

    engine.emit('ended')

    expect(player.status).toBe('paused')
    expect(engine.play).toHaveBeenCalledTimes(1)
  })

  it('all on a single track plays it again in place, without reloading it', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[0]!)
    player.cycleRepeat()

    engine.emit('ended')
    await vi.waitFor(() => expect(engine.play).toHaveBeenCalledTimes(2))

    expect(engine.seek).toHaveBeenLastCalledWith(0)
    expect(tracksApi.get).toHaveBeenCalledTimes(1)
    expect(tracksApi.playback).toHaveBeenCalledTimes(1)
  })
})

describe('shuffle', () => {
  /** A library of six tracks: a shuffle of five upcoming ones is almost never the identity. */
  const six = ['a', 'b', 'c', 'd', 'e', 'f'].map(summary)
  /** Ids of a list of queue items. */
  const ids = (items: { id: string }[]) => items.map(t => t.id)
  /**
   * Math.random() always 0: Fisher–Yates then moves every item one place to
   * the left (the first one goes last), so each shuffle has a known result.
   */
  const rotateOnShuffle = () => vi.spyOn(Math, 'random').mockReturnValue(0)

  it('turning it on shuffles the upcoming tracks only', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(six[1]!, six)
    rotateOnShuffle()
    player.setShuffle(true)

    expect(player.shuffle).toBe(true)
    expect(ids(player.queue)).toEqual(['a', 'b', 'd', 'e', 'f', 'c'])
    expect(player.originalOrder).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('turning it off carries on in the original order from the current track', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(six[1]!, six)
    player.setShuffle(true)
    player.setShuffle(false)

    expect(ids(player.upcoming)).toEqual(['c', 'd', 'e', 'f'])
    // Still known: new rounds of "repeat all" follow it.
    expect(player.originalOrder).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('turning it on again keeps the order the list had before the first shuffle', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(six[0]!, six)
    rotateOnShuffle()
    player.setShuffle(true)
    // Shuffled: a, then c d e f b. Moving on to "d" and turning shuffle off leaves a mixed queue.
    await player.playFromQueue(2)
    player.setShuffle(false)
    expect(ids(player.queue)).toEqual(['a', 'c', 'd', 'e', 'f', 'b'])

    player.setShuffle(true)

    expect(player.originalOrder).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('repeat all with shuffle turned off: the new round plays the original order', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(six[0]!, six)
    rotateOnShuffle()
    player.setShuffle(true)
    // Shuffled: a, then c d e f b. Play to the end, then turn shuffle off.
    await player.playFromQueue(5)
    player.setShuffle(false)
    player.cycleRepeat()

    await player.next()

    expect(ids(player.queue)).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(player.current?.id).toBe('a')
  })

  it('play all starts from the first track, or from a random one while shuffled', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playAll(six)
    expect(player.current?.id).toBe('a')

    player.close()
    player.setShuffle(true)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    await player.playAll(six)

    expect(player.current?.id).toBe('d')
    expect(ids(player.upcoming).sort()).toEqual(['a', 'b', 'c', 'e', 'f'])
  })

  it('starting from the library plays the chosen track first, then all the others shuffled', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    player.setShuffle(true)
    await player.playTrack(six[3]!, six)

    expect(player.index).toBe(0)
    expect(player.current?.id).toBe('d')
    expect(ids(player.upcoming).sort()).toEqual(['a', 'b', 'c', 'e', 'f'])
    // Back in order: carry on after "d", wrapping around.
    player.setShuffle(false)
    expect(ids(player.upcoming)).toEqual(['e', 'f', 'a', 'b', 'c'])
  })

  it('add to queue puts the track at a random place among the upcoming ones', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(six[0]!, six.slice(0, 3))
    player.setShuffle(true)
    vi.spyOn(Math, 'random').mockReturnValue(0)

    await player.addToQueue(six[5]!)

    expect(player.queue[1]?.id).toBe('f')
    expect(player.originalOrder).toEqual(['a', 'b', 'c', 'f'])
  })

  it('play next still goes right after the current track', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(six[0]!, six.slice(0, 3))
    player.setShuffle(true)

    await player.playNext(six[5]!)

    expect(player.queue[1]?.id).toBe('f')
    expect(player.originalOrder).toEqual(['a', 'b', 'c', 'f'])
  })

  it('repeat all reshuffles the whole queue for each new round', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(six[0]!, six)
    await player.playFromQueue(5)
    player.setShuffle(true)
    player.cycleRepeat()
    rotateOnShuffle()

    await player.next()

    expect(ids(player.queue)).toEqual(['b', 'c', 'd', 'e', 'f', 'a'])
    expect(player.index).toBe(0)
    expect(player.current?.id).toBe('b')
  })

  it('a new round never starts with the track that just ended', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(six[0]!, six.slice(0, 2))
    await player.playFromQueue(1)
    player.setShuffle(true)
    player.cycleRepeat()
    // The rotation would start the round with "b", the track that just ended.
    rotateOnShuffle()

    await player.next()

    expect(ids(player.queue)).toEqual(['a', 'b'])
    expect(player.current?.id).toBe('a')
  })

  it('on public pages it only changes the setting', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playSharedPlaylist(sharedPlaylist, 0)
    // The shared list's order, which must not change.
    const order = ids(player.queue)

    player.setShuffle(true)

    expect(player.shuffle).toBe(true)
    expect(ids(player.queue)).toEqual(order)
  })

  it('a restored shuffled queue can still go back to its original order', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    player.setShuffle(true)
    await player.restoreQueue(['c', 'b', 'a'].map(summary), 0, 0, ['a', 'b', 'c'])

    expect(player.originalOrder).toEqual(['a', 'b', 'c'])
    // After "c" the original order wraps around to "a", then "b".
    player.setShuffle(false)
    expect(ids(player.upcoming)).toEqual(['a', 'b'])
  })

  it('a queue saved without an original order keeps its order when shuffle is turned off', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    player.setShuffle(true)
    await player.restoreQueue(['c', 'b', 'a'].map(summary), 0, 0)

    expect(player.originalOrder).toEqual(['c', 'b', 'a'])
    player.setShuffle(false)
    expect(ids(player.upcoming)).toEqual(['b', 'a'])
  })

  it('a restored queue keeps its original order with shuffle off too (for repeat all)', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.restoreQueue(['c', 'b', 'a'].map(summary), 0, 0, ['a', 'b', 'c'])

    expect(player.originalOrder).toEqual(['a', 'b', 'c'])
  })

  it('closing the player forgets the original order but keeps the setting', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(six[0]!, six)
    player.setShuffle(true)

    player.close()

    expect(player.shuffle).toBe(true)
    expect(player.originalOrder).toBeNull()
  })

  it('a shared list never keeps the library\'s original order', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(six[0]!, six)
    player.setShuffle(true)

    await player.playSharedPlaylist(sharedPlaylist, 0)

    expect(player.originalOrder).toBeNull()
  })

  it('a server-rendered page does not overwrite the remembered settings', () => {
    // This browser's storage: a volume and modes saved by an earlier visit.
    const stored = new Map<string, string>([
      ['chronovault:volume', '0.4'],
      ['chronovault:playback-modes', JSON.stringify({ shuffle: true, repeat: 'one' })],
    ])
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    })
    try {
      // What the public pages (/t, /p) hand over from the server: the whole state of a
      // fresh store, serialized to JSON as Nuxt does, with the server's defaults for the
      // settings (it has no localStorage). The whole state, not just the settings: Pinia
      // hydrates every ref from it, and a missing key would leave the queue undefined.
      const server = createPinia()
      setActivePinia(server)
      // The store as the server builds it.
      const serverStore = usePlayerStore()
      const handedOver = JSON.parse(JSON.stringify(server.state.value.player))
      serverStore.$dispose()

      // A fresh Pinia, as on a page load, holding what the server handed over.
      const pinia = createPinia()
      pinia.state.value.player = { ...handedOver, volume: 1, shuffle: false, repeat: 'off' }
      setActivePinia(pinia)

      // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
      const player = usePlayerStore()

      expect(player.volume).toBe(0.4)
      expect(player.shuffle).toBe(true)
      expect(player.repeat).toBe('one')
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('is remembered with the repeat mode for the next visit', () => {
    // This browser's storage, empty at first.
    const stored = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    })
    try {
      // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
      const player = usePlayerStore()
      player.setShuffle(true)
      player.cycleRepeat()

      setActivePinia(createPinia())
      // The store of the next visit (a new Pinia), reading what this one saved.
      const next = usePlayerStore()
      expect(next.shuffle).toBe(true)
      expect(next.repeat).toBe('all')
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('the next track, asked for ahead', () => {
  /** Plays "a" from the library (a, b, c: 120 s each), so "b" comes next. */
  async function playFirst() {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)
    await vi.waitFor(() => expect(player.status).toBe('playing'))
    return player
  }

  /** How many times the streaming address of track `id` was asked for. */
  function asked(id: string): number {
    return vi.mocked(tracksApi.playback).mock.calls.filter(([trackId]) => trackId === id).length
  }

  /** Lets pending promises settle (the answer asked for ahead coming in). */
  function settle() {
    return new Promise(resolve => setTimeout(resolve, 0))
  }

  it('asks for the next track 20 seconds before the end, not earlier', async () => {
    await playFirst()
    engine.emit('time', 90)
    await settle()
    expect(asked('b')).toBe(0)
    engine.emit('time', 101)
    await vi.waitFor(() => expect(asked('b')).toBe(1))
    expect(tracksApi.get).toHaveBeenCalledWith('b')
  })

  it('asks half-way through a track shorter than 40 seconds', async () => {
    await playFirst()
    engine.emit('duration', 30)
    engine.emit('time', 14)
    await settle()
    expect(asked('b')).toBe(0)
    engine.emit('time', 16)
    await vi.waitFor(() => expect(asked('b')).toBe(1))
  })

  it('starts it at once when the track ends: no new request, loaded and played in the same moment', async () => {
    // "a" playing from the library: "b" comes next (see playFirst).
    const player = await playFirst()
    engine.emit('time', 101)
    await vi.waitFor(() => expect(asked('b')).toBe(1))
    await settle()
    engine.load.mockClear()
    engine.play.mockClear()

    engine.emit('ended')
    // Synchronously, in the same call as the end: nothing waited for the network.
    expect(engine.load).toHaveBeenCalledWith('https://audio/b')
    expect(engine.play).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(player.current?.id).toBe('b'))
    expect(asked('b')).toBe(1)
  })

  it('the next track changed (Up next edited): the new one is asked for, and plays', async () => {
    // "a" playing from the library: "b" comes next (see playFirst).
    const player = await playFirst()
    engine.emit('time', 101)
    await vi.waitFor(() => expect(asked('b')).toBe(1))
    await player.playNext(library[2]!)
    await vi.waitFor(() => expect(asked('c')).toBe(1))
    await settle()

    engine.emit('ended')
    expect(engine.load).toHaveBeenLastCalledWith('https://audio/c')
    await vi.waitFor(() => expect(player.current?.id).toBe('c'))
    expect(asked('c')).toBe(1)
  })

  it('asks nothing while paused (the track may never end)', async () => {
    // "a" playing from the library: "b" comes next (see playFirst).
    const player = await playFirst()
    player.pause()
    engine.emit('time', 101)
    await settle()
    expect(asked('b')).toBe(0)
  })

  it('asks nothing with repeat one: the same track starts again', async () => {
    // "a" playing from the library: "b" comes next (see playFirst).
    const player = await playFirst()
    player.cycleRepeat()
    player.cycleRepeat()
    expect(player.repeat).toBe('one')
    engine.emit('time', 101)
    await settle()
    expect(asked('b')).toBe(0)
  })

  it('repeat all: at the last track, asks for the first of the new round, but not while shuffled', async () => {
    // The store under test (a fresh one in every test: beforeEach installs a new Pinia).
    const player = usePlayerStore()
    player.cycleRepeat()
    await player.playTrack(library[2]!, library)
    await vi.waitFor(() => expect(player.status).toBe('playing'))
    engine.emit('time', 101)
    await vi.waitFor(() => expect(asked('a')).toBe(1))

    // Shuffled, the new round is drawn only when it starts: nothing to ask for ahead.
    player.close()
    player.setShuffle(true)
    await player.playTrack(library[2]!, [library[2]!])
    await vi.waitFor(() => expect(player.status).toBe('playing'))
    vi.mocked(tracksApi.playback).mockClear()
    engine.emit('time', 101)
    await settle()
    expect(vi.mocked(tracksApi.playback)).not.toHaveBeenCalled()
  })

  it('asks again at the end for an address about to expire', async () => {
    // "a" playing from the library: "b" comes next (see playFirst).
    const player = await playFirst()
    // The address asked for ahead has 30 s left: less than the safety margin.
    vi.mocked(tracksApi.playback).mockImplementationOnce(async id => ({
      url: `https://audio/${id}`,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    }))
    engine.emit('time', 101)
    await vi.waitFor(() => expect(asked('b')).toBe(1))
    await settle()

    engine.emit('ended')
    await vi.waitFor(() => expect(player.current?.id).toBe('b'))
    expect(asked('b')).toBe(2)
  })

  it('asks again at the end when the request ahead failed', async () => {
    // "a" playing from the library: "b" comes next (see playFirst).
    const player = await playFirst()
    vi.mocked(tracksApi.playback).mockRejectedValueOnce(new Error('offline'))
    engine.emit('time', 101)
    await vi.waitFor(() => expect(asked('b')).toBe(1))
    await settle()

    engine.emit('ended')
    await vi.waitFor(() => expect(player.current?.id).toBe('b'))
    expect(asked('b')).toBe(2)
    expect(player.status).toBe('playing')
  })

  it('closing the player forgets what was asked for ahead', async () => {
    // "a" playing from the library: "b" comes next (see playFirst).
    const player = await playFirst()
    engine.emit('time', 101)
    await vi.waitFor(() => expect(asked('b')).toBe(1))
    await settle()
    player.close()

    await player.playTrack(library[1]!, library)
    expect(asked('b')).toBe(2)
  })
})
