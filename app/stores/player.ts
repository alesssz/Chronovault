import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { PlaybackSource, SharedTrack, TrackDetail, TrackSummary } from '~~/shared/types/track'
import type { SharedPlaylist } from '~~/shared/types/playlist'
import { getAudioEngine, type PlaybackEngine } from '~/lib/audio-engine'
import { sharedApi, tracksApi } from '~/services/api'
import { getErrorMessage } from '~/utils/errors'

/**
 * - `idle`: nothing loaded, the player bar is hidden;
 * - `loading`: fetching track data and a streaming URL;
 * - `playing` / `paused`: a track is loaded in the engine;
 * - `error`: the last load or resume failed (`error` holds the message).
 */
export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

/** A queued track: what the player bar shows while the full data loads. */
export type QueueItem = Pick<TrackSummary, 'id' | 'title' | 'composers' | 'album' | 'year' | 'durationSeconds' | 'coverUrl'>
  & Partial<Pick<TrackSummary, 'genreId'>>

/** The track being played: a library track or a shared one (public page). */
export type PlayerTrack = QueueItem & Pick<TrackDetail, 'lyrics' | 'lyricsSynced' | 'peaks'>

/** Where the player gets track data and streaming URLs from. */
export interface TrackSource {
  /** Identifies the source: 'library', 'track:<id>' or 'playlist:<id>'. */
  key: string
  get: (id: string) => Promise<PlayerTrack>
  playback: (id: string) => Promise<PlaybackSource>
}

/** The user's own library (sign-in required). */
const librarySource: TrackSource = { key: 'library', get: tracksApi.get, playback: tracksApi.playback }

/** A track shared by link: its data is already known, audio URLs come from the public API. */
function sharedTrackSource(track: SharedTrack): TrackSource {
  return { key: `track:${track.id}`, get: async () => track, playback: sharedApi.playback }
}

/** A shared playlist: track data is already known, audio URLs are signed through the playlist. */
function sharedPlaylistSource(playlist: SharedPlaylist): TrackSource {
  return {
    key: `playlist:${playlist.id}`,
    get: async (id) => {
      const track = playlist.tracks.find(t => t.id === id)
      if (!track) throw new Error('Track not found in the playlist')
      return track
    },
    playback: id => sharedApi.playlistTrackPlayback(playlist.id, id),
  }
}

/** Past this point (seconds) "previous" restarts the track instead of going back. */
const RESTART_THRESHOLD = 3
/** localStorage key of the volume: the only player setting remembered across visits. */
const VOLUME_KEY = 'chronoplayer:volume'
/** A signed URL this close to its expiry is replaced before being used again. */
const SOURCE_EXPIRY_MARGIN_MS = 60_000
/** Playback speed bounds (the sync editor uses 0.5 and 0.75). */
const MIN_PLAYBACK_RATE = 0.25
const MAX_PLAYBACK_RATE = 2

/**
 * Player state shared by the whole app (bottom bar, expanded view, lyrics
 * editor). The actual audio lives in the engine (`getAudioEngine`):
 * this store only holds reactive state and commands.
 *
 * Audio is streamed from signed URLs that expire. A paused track can sit for
 * hours, so before resuming or seeking an expired URL is replaced with a fresh
 * one at the same position; when storage refuses a URL anyway, the source is
 * reloaded once before an error is shown.
 */
export const usePlayerStore = defineStore('player', () => {
  /** Tracks that "next"/"previous" move through (the library view, a playlist…). */
  const queue = ref<QueueItem[]>([])
  /** Position of the current track in `queue`; -1 when idle. */
  const index = ref(-1)
  /**
   * Full data of the loaded track (lyrics, peaks). Set only once its audio
   * is in the engine. shallowRef: it is replaced, never mutated in place.
   */
  const current = shallowRef<PlayerTrack | null>(null)
  const status = ref<PlayerStatus>('idle')
  /** The element is waiting for data (spinner on the play button). */
  const buffering = ref(false)
  /** Position in seconds, updated every animation frame while playing. */
  const currentTime = ref(0)
  /** From the track data at first, then from the audio element once known. */
  const duration = ref(0)
  const volume = ref(readStoredVolume())
  const muted = ref(false)
  /** Playback speed (1 = normal); slowed down while syncing lyrics. */
  const playbackRate = ref(1)
  /** The full-screen view (PlayerExpanded) is open. */
  const expanded = ref(false)
  const error = ref<string | null>(null)
  /** Key of the current source (see TrackSource): lets public pages know the player is theirs. */
  const sourceKey = ref(librarySource.key)

  const isActive = computed(() => status.value !== 'idle')
  const isPlaying = computed(() => status.value === 'playing')
  const hasNext = computed(() => index.value < queue.value.length - 1)
  const hasPrevious = computed(() => index.value > 0)
  const progress = computed(() => (duration.value > 0 ? Math.min(1, currentTime.value / duration.value) : 0))

  let engineRef: PlaybackEngine | null = null
  /** Where the queued tracks come from: the library, or a shared link. */
  let source: TrackSource = librarySource
  /** Incremented on every track change: responses of superseded loads are discarded. */
  let loadToken = 0
  /** Expiry (ms since epoch) of the signed URL loaded in the engine. */
  let sourceExpiresAt = 0
  /** Whether the current source was already reloaded after a failure. */
  let sourceRecovered = false
  /** A source reload is in progress: engine errors are handled by it. */
  let recovering = false

  function engine(): PlaybackEngine {
    if (engineRef) return engineRef
    const e = getAudioEngine()
    e.setVolume(volume.value)
    e.on('time', (t) => {
      currentTime.value = t
    })
    e.on('duration', (d) => {
      if (d > 0) duration.value = d
    })
    e.on('play', () => {
      status.value = 'playing'
    })
    e.on('pause', () => {
      if (status.value === 'playing') status.value = 'paused'
    })
    e.on('buffering', (waiting) => {
      buffering.value = waiting
      // Audio is flowing again: a later failure may be recovered once more.
      if (!waiting) sourceRecovered = false
    })
    e.on('ended', () => {
      if (hasNext.value) void loadIndex(index.value + 1, true)
      else status.value = 'paused'
    })
    e.on('error', (message) => {
      // Initial loads and reloads handle their own failures.
      if (status.value === 'idle' || status.value === 'loading' || recovering) return
      // Typically an expired signed URL refused while seeking or buffering.
      void recoverSource(status.value === 'playing').then((ok) => {
        if (!ok) fail(message)
      })
    })
    engineRef = e
    return e
  }

  function fail(message: string): void {
    status.value = 'error'
    error.value = message
  }

  function sourceExpired(): boolean {
    return Date.now() > sourceExpiresAt - SOURCE_EXPIRY_MARGIN_MS
  }

  /** Loads a fresh signed URL for `trackId` into the engine, starting at `position`. */
  async function loadSource(trackId: string, position: number, token: number): Promise<boolean> {
    const playback = await source.playback(trackId)
    if (token !== loadToken) return false
    const e = engine()
    e.load(playback.url)
    sourceExpiresAt = Date.parse(playback.expiresAt) || 0
    if (position > 0) e.seek(position)
    return true
  }

  /**
   * Replaces the current source with a fresh signed URL at the current
   * position, at most once per source. Resolves to false when it gives up.
   */
  async function recoverSource(
    resume: boolean,
    // The element's own position by default: the waveform may have just moved it.
    position = engine().currentTime || currentTime.value,
  ): Promise<boolean> {
    const track = current.value
    if (!track || sourceRecovered) return false
    sourceRecovered = true
    recovering = true
    const token = loadToken
    try {
      if (!(await loadSource(track.id, position, token))) return true
      if (resume) await engine().play()
      else if (status.value !== 'paused') status.value = 'paused'
      return true
    }
    catch {
      return false
    }
    finally {
      recovering = false
    }
  }

  async function loadIndex(i: number, autoplay: boolean): Promise<void> {
    const summary = queue.value[i]
    if (!summary) return
    const token = ++loadToken
    const e = engine()

    e.pause()
    index.value = i
    status.value = 'loading'
    error.value = null
    currentTime.value = 0
    duration.value = summary.durationSeconds ?? 0
    sourceRecovered = false

    try {
      const [detail, playback] = await Promise.all([source.get(summary.id), source.playback(summary.id)])
      if (token !== loadToken) return
      // Audio source first, then the current track: the waveform mounted when
      // `current` changes already finds the audio element on the right file.
      e.load(playback.url)
      sourceExpiresAt = Date.parse(playback.expiresAt) || 0
      current.value = detail
      if (detail.durationSeconds) duration.value = detail.durationSeconds
      if (!autoplay) {
        status.value = 'paused'
        return
      }
      try {
        await e.play()
      }
      catch (err) {
        if (token !== loadToken) return
        if (!(await recoverSource(true))) throw err
      }
    }
    catch (err) {
      if (token !== loadToken) return
      fail(getErrorMessage(err, 'Could not play the track'))
    }
  }

  /** Plays `track`, using `context` (e.g. the library) as the queue. */
  async function playTrack(track: QueueItem, context: QueueItem[] = [track]): Promise<void> {
    if (current.value?.id === track.id && source === librarySource && status.value !== 'error') {
      await togglePlay()
      return
    }
    setSource(librarySource)
    queue.value = [...context]
    const i = queue.value.findIndex(t => t.id === track.id)
    if (i === -1) queue.value = [track, ...queue.value]
    await loadIndex(Math.max(0, i), true)
  }

  function setSource(next: TrackSource): void {
    source = next
    sourceKey.value = next.key
  }

  /** Loads a track shared by link without starting it (public share page). */
  async function cueShared(track: SharedTrack): Promise<void> {
    setSource(sharedTrackSource(track))
    queue.value = [track]
    await loadIndex(0, false)
  }

  /**
   * Plays a shared playlist from `index` (public playlist page); with
   * `autoplay: false` the track is only loaded. On the track already loaded
   * it toggles play/pause instead.
   */
  async function playSharedPlaylist(playlist: SharedPlaylist, index = 0, autoplay = true): Promise<void> {
    const key = sharedPlaylistSource(playlist).key
    const track = playlist.tracks[index]
    if (!track) return
    if (sourceKey.value === key && current.value?.id === track.id && status.value !== 'error') {
      if (autoplay) await togglePlay()
      return
    }
    setSource(sharedPlaylistSource(playlist))
    queue.value = [...playlist.tracks]
    await loadIndex(index, autoplay)
  }

  async function play(): Promise<void> {
    if (status.value === 'idle' || status.value === 'loading') return
    if (status.value === 'error') return loadIndex(index.value, true)

    // A track paused for hours: its signed URL has expired in the meantime.
    if (sourceExpired()) {
      sourceRecovered = false
      if (!(await recoverSource(true))) fail('Could not resume playback')
      return
    }
    try {
      await engine().play()
    }
    catch (err) {
      if (!(await recoverSource(true))) fail(getErrorMessage(err, 'Could not start playback'))
    }
  }

  function pause(): void {
    if (status.value === 'playing') engine().pause()
  }

  async function togglePlay(): Promise<void> {
    if (status.value === 'playing') pause()
    else await play()
  }

  function stop(): void {
    if (!isActive.value) return
    engine().stop()
    currentTime.value = 0
    if (status.value === 'playing') status.value = 'paused'
  }

  async function next(): Promise<void> {
    if (hasNext.value) await loadIndex(index.value + 1, true)
  }

  async function previous(): Promise<void> {
    if (currentTime.value > RESTART_THRESHOLD || !hasPrevious.value) seek(0)
    else await loadIndex(index.value - 1, true)
  }

  function seek(seconds: number): void {
    if (!isActive.value) return
    const position = Math.max(0, seconds)
    currentTime.value = position
    if (current.value && sourceExpired() && status.value !== 'loading') {
      // Seeking makes the browser request the file again: use a fresh URL.
      sourceRecovered = false
      void recoverSource(status.value === 'playing', position).then((ok) => {
        if (!ok) fail('Could not reload the track')
      })
      return
    }
    engine().seek(position)
  }

  function setVolume(value: number): void {
    volume.value = Math.min(1, Math.max(0, value))
    engine().setVolume(volume.value)
    if (volume.value > 0 && muted.value) setMuted(false)
    storeVolume(volume.value)
  }

  function setMuted(value: boolean): void {
    muted.value = value
    engine().setMuted(value)
  }

  function toggleMute(): void {
    setMuted(!muted.value)
  }

  /** Changes the playback speed, keeping the pitch (e.g. 0.75 while syncing lyrics). */
  function setPlaybackRate(rate: number): void {
    const value = Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, rate))
    if (value === playbackRate.value) return
    playbackRate.value = value
    engine().setPlaybackRate(value)
  }

  function setExpanded(value: boolean): void {
    expanded.value = value && isActive.value
  }

  /** Closes the player, clears the queue and drops the audio source. */
  function close(): void {
    loadToken++
    if (engineRef) engineRef.unload()
    queue.value = []
    index.value = -1
    current.value = null
    status.value = 'idle'
    currentTime.value = 0
    duration.value = 0
    expanded.value = false
    error.value = null
    sourceExpiresAt = 0
    sourceRecovered = false
    setSource(librarySource)
    if (playbackRate.value !== 1) {
      playbackRate.value = 1
      engineRef?.setPlaybackRate(1)
    }
  }

  /** Refreshes track data after an edit in the editor. */
  function syncTrack(detail: TrackDetail): void {
    if (current.value?.id === detail.id) current.value = detail
    const i = queue.value.findIndex(t => t.id === detail.id)
    if (i !== -1) {
      const updated = [...queue.value]
      updated[i] = { ...updated[i]!, ...pickSummary(detail) }
      queue.value = updated
    }
  }

  /** Removes a deleted track from the queue (and closes the player if it was playing). */
  function removeTrack(id: string): void {
    if (current.value?.id === id) {
      close()
      return
    }
    const i = queue.value.findIndex(t => t.id === id)
    if (i === -1) return
    queue.value = queue.value.filter(t => t.id !== id)
    if (i < index.value) index.value--
  }

  return {
    // state
    queue, index, current, status, buffering, currentTime, duration, volume, muted, playbackRate, expanded, error, sourceKey,
    // derived
    isActive, isPlaying, hasNext, hasPrevious, progress,
    // commands
    playTrack, cueShared, playSharedPlaylist, play, pause, togglePlay, stop, next, previous, seek,
    setVolume, setMuted, toggleMute, setPlaybackRate, setExpanded, close, syncTrack, removeTrack,
  }
})

function pickSummary(detail: TrackDetail): TrackSummary {
  const {
    description: _d, sunoPrompt: _s, lyrics: _l, lyricsSynced: _ls, peaks: _p,
    mimeType: _m, sizeBytes: _sb, audioPath: _a, coverPath: _c, ...summary
  } = detail
  return summary
}

function readStoredVolume(): number {
  try {
    const raw = globalThis.localStorage?.getItem(VOLUME_KEY)
    const value = raw == null ? Number.NaN : Number(raw)
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1
  }
  catch {
    return 1
  }
}

function storeVolume(value: number): void {
  try {
    globalThis.localStorage?.setItem(VOLUME_KEY, String(value))
  }
  catch {
    // Storage unavailable (e.g. private browsing): the volume is not remembered.
  }
}
