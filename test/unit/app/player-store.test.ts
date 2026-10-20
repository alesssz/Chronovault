import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { SharedTrack, TrackDetail, TrackSummary } from '~~/shared/types/track'
import { setAudioEngine, type AudioEngineEvents, type PlaybackEngine } from '~/lib/audio-engine'
import { sharedApi, tracksApi } from '~/services/api'
import { usePlayerStore } from '~/stores/player'

vi.mock('~/services/api', () => ({
  tracksApi: { get: vi.fn(), playback: vi.fn() },
  sharedApi: { get: vi.fn(), playback: vi.fn() },
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

  on<K extends keyof AudioEngineEvents>(event: K, listener: AudioEngineEvents[K]) {
    const set = this.handlers.get(event) ?? new Set()
    set.add(listener as (...args: unknown[]) => void)
    this.handlers.set(event, set)
    return () => set.delete(listener as (...args: unknown[]) => void)
  }

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

function summary(id: string): TrackSummary {
  return {
    id, title: `Track ${id}`, composers: null, album: null, year: null, genreId: null, mastered: false,
    visibility: 'private', durationSeconds: 120, hasLyrics: false, hasSyncedLyrics: false, coverUrl: null,
    createdAt: '', updatedAt: '',
  }
}

function detail(id: string): TrackDetail {
  return {
    ...summary(id), description: null, sunoPrompt: null, lyrics: null, lyricsSynced: null,
    peaks: null, mimeType: 'audio/mpeg', sizeBytes: 1, audioPath: `u/${id}.mp3`, coverPath: null,
  }
}

const library = ['a', 'b', 'c'].map(summary)
let engine: FakeEngine

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
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('player store', () => {
  it('starts idle', () => {
    const player = usePlayerStore()
    expect(player.status).toBe('idle')
    expect(player.isActive).toBe(false)
  })

  it('plays a track using the library as the queue', async () => {
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
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)
    await player.playTrack(library[0]!, library)
    expect(player.status).toBe('paused')
    expect(engine.load).toHaveBeenCalledTimes(1)

    await player.playTrack(library[0]!, library)
    expect(player.status).toBe('playing')
  })

  it('moves to the next track when one ends and stops at the end of the queue', async () => {
    const player = usePlayerStore()
    await player.playTrack(library[1]!, library)

    engine.emit('ended')
    await vi.waitFor(() => expect(player.current?.id).toBe('c'))

    engine.emit('ended')
    expect(player.status).toBe('paused')
    expect(player.current?.id).toBe('c')
  })

  it('"previous" restarts an advanced track, otherwise goes back', async () => {
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
    const player = usePlayerStore()
    let releaseSlow!: () => void
    vi.mocked(tracksApi.get).mockImplementationOnce(id => new Promise((resolve) => {
      releaseSlow = () => resolve(detail(id))
    }))

    const slow = player.playTrack(library[0]!, library)
    await player.playTrack(library[2]!, library)
    releaseSlow()
    await slow

    expect(player.current?.id).toBe('c')
    expect(engine.load).toHaveBeenCalledTimes(1)
    expect(engine.load).toHaveBeenCalledWith('https://audio/c')
  })

  it('shows an error when the track fails to load', async () => {
    const player = usePlayerStore()
    vi.mocked(tracksApi.playback).mockRejectedValueOnce({ data: { message: 'Track not found' } })

    await player.playTrack(library[0]!, library)

    expect(player.status).toBe('error')
    expect(player.error).toBe('Track not found')
  })

  it('clamps the volume to 0..1 and raising it unmutes', async () => {
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)

    player.toggleMute()
    expect(engine.muted).toBe(true)

    player.setVolume(1.5)
    expect(player.volume).toBe(1)
    expect(engine.muted).toBe(false)
  })

  it('stop rewinds to the start and pauses', async () => {
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)
    engine.emit('time', 30)

    player.stop()

    expect(engine.stop).toHaveBeenCalled()
    expect(player.currentTime).toBe(0)
    expect(player.status).toBe('paused')
  })

  it('changes the playback speed within limits', async () => {
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
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)
    player.setPlaybackRate(0.5)

    player.close()

    expect(player.playbackRate).toBe(1)
    expect(engine.rate).toBe(1)
  })

  it('closing the player drops the audio source', async () => {
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)

    player.close()

    expect(engine.unload).toHaveBeenCalled()
    expect(player.status).toBe('idle')
  })

  it('deleting the playing track closes the player', async () => {
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
    const player = usePlayerStore()
    player.setExpanded(true)
    expect(player.expanded).toBe(false)

    await player.playTrack(library[0]!, library)
    player.setExpanded(true)
    expect(player.expanded).toBe(true)
  })

  it('refreshes title and details after an edit in the editor', async () => {
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)

    player.syncTrack({ ...detail('a'), title: 'New title' })

    expect(player.current?.title).toBe('New title')
    expect(player.queue[0]?.title).toBe('New title')
    expect(player.queue[0]).not.toHaveProperty('audioPath')
  })
})

describe('expired or refused audio sources', () => {
  it('resuming after the signed URL expired loads a fresh one at the same position', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
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
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)
    player.pause()

    await player.play()

    expect(tracksApi.playback).toHaveBeenCalledTimes(1)
    expect(engine.load).toHaveBeenCalledTimes(1)
  })

  it('seeking after expiry reloads the source at the new position and keeps playing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
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
    const player = usePlayerStore()
    engine.play.mockRejectedValueOnce(new DOMException('Failed to load because no supported source was found.', 'NotSupportedError'))

    await player.playTrack(library[0]!, library)

    expect(tracksApi.playback).toHaveBeenCalledTimes(2)
    expect(player.status).toBe('playing')
  })

  it('shows the browser error when the retry fails too', async () => {
    const player = usePlayerStore()
    const refused = new DOMException('Failed to load because no supported source was found.', 'NotSupportedError')
    engine.play.mockRejectedValueOnce(refused).mockRejectedValueOnce(refused)

    await player.playTrack(library[0]!, library)

    expect(player.status).toBe('error')
    expect(player.error).toBe('Failed to load because no supported source was found.')
  })

  describe('shared tracks (public page)', () => {
    const shared: SharedTrack = {
      id: 's', title: 'Shared', composers: null, album: null, year: null, genre: 'Ambient', description: null,
      lyrics: null, lyricsSynced: null, peaks: [0.5], durationSeconds: 90, coverUrl: null,
      visibility: 'unlisted', updatedAt: '',
    }

    it('cues a shared track without playing it, using the public API only', async () => {
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
      const player = usePlayerStore()
      await player.cueShared(shared)

      vi.setSystemTime(Date.now() + SIX_HOURS + 1000)
      await player.play()

      expect(sharedApi.playback).toHaveBeenCalledTimes(2)
      expect(tracksApi.playback).not.toHaveBeenCalled()
      expect(player.status).toBe('playing')
    })

    it('playing from the library afterwards goes back to the library API', async () => {
      const player = usePlayerStore()
      await player.cueShared(shared)
      await player.playTrack(library[0]!, library)

      expect(engine.load).toHaveBeenLastCalledWith('https://audio/a')
      expect(tracksApi.get).toHaveBeenCalledWith('a')
    })
  })
})
