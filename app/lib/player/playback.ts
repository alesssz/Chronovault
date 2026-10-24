/**
 * Playback of one track at a time: the reactive mirror of the audio engine
 * (status, time, duration, volume, speed) and the commands that drive it
 * (load, play, pause, seek…). It knows nothing of the queue: the store
 * (app/stores/player.ts) tells it which track to load, and hears from it
 * when a track ends.
 *
 * Audio is streamed from signed URLs that expire. A paused track can sit for
 * hours, so before resuming or seeking an expired URL is replaced with a
 * fresh one at the same position; when storage refuses a URL anyway, the
 * source is reloaded once before an error is shown.
 *
 * The actual audio lives in the engine (`getAudioEngine`, one `<audio>`
 * element outside Vue): this part only holds reactive state and commands.
 */
import { computed, ref, shallowRef } from 'vue'
import type { PlaybackSource } from '~~/shared/types/track'
import { clamp } from '~~/shared/utils/numbers'
import { getAudioEngine, type PlaybackEngine } from '~/lib/audio-engine'
import { getErrorMessage } from '~/utils/errors'
import { readStoredVolume, storeVolume } from './settings'
import type { TrackSource } from './sources'
import type { PlayerStatus, PlayerTrack, QueueItem } from './types'

/** A signed URL this close to its expiry is replaced before being used again. */
const SOURCE_EXPIRY_MARGIN_MS = 60_000
/** Playback speed bounds (the sync editor uses 0.5 and 0.75). */
const MIN_PLAYBACK_RATE = 0.25
/** Upper speed bound (no UI uses more than 1× today; kept generous for the API). */
const MAX_PLAYBACK_RATE = 2

/** What playback needs from the store that owns it. */
export interface PlaybackOptions {
  /** Where track data and streaming URLs come from right now (it changes with the page). */
  source: () => TrackSource
  /** Loads the current queue track again, playing (resuming after an error). */
  reload: () => Promise<void>
  /**
   * A track played to its end. Returns true when the store moves on (next
   * track, repeat); false leaves the player paused at the end.
   */
  onEnded: () => boolean
}

/** Reactive playback of one track; create one per player (see the file comment). */
export function createPlayback({ source, reload, onEnded }: PlaybackOptions) {
  /**
   * Full data of the loaded track (lyrics, peaks). Set only once its audio
   * is in the engine. shallowRef: it is replaced, never mutated in place.
   */
  const current = shallowRef<PlayerTrack | null>(null)
  /** Lifecycle of the player (see PlayerStatus). */
  const status = ref<PlayerStatus>('idle')
  /** The element is waiting for data (spinner on the play button). */
  const buffering = ref(false)
  /** Position in seconds, updated every animation frame while playing. */
  const currentTime = ref(0)
  /** From the track data at first, then from the audio element once known. */
  const duration = ref(0)
  /** 0..1, restored from the previous visit. */
  const volume = ref(readStoredVolume())
  /** Mute is separate from the volume, so unmuting brings the old level back. */
  const muted = ref(false)
  /** Playback speed (1 = normal); slowed down while syncing lyrics. */
  const playbackRate = ref(1)
  /** Message of the last failure (status 'error'), shown in the player bar. */
  const error = ref<string | null>(null)

  /** Something is loaded (or loading): the player bar is shown. */
  const isActive = computed(() => status.value !== 'idle')
  /** Audio is playing right now (Play/Pause icons). */
  const isPlaying = computed(() => status.value === 'playing')
  /** 0..1 position in the track, for the thin progress line of the mobile bar. */
  const progress = computed(() => (duration.value > 0 ? Math.min(1, currentTime.value / duration.value) : 0))

  // --- Non-reactive internals ----------------------------------------------------------
  /** The audio engine, wired to this player on first use (see engine()). */
  let engineRef: PlaybackEngine | null = null
  /** Incremented on every track change: responses of superseded loads are discarded. */
  let loadToken = 0
  /** Expiry (ms since epoch) of the signed URL loaded in the engine. */
  let sourceExpiresAt = 0
  /** Whether the current source was already reloaded after a failure. */
  let sourceRecovered = false
  /** A source reload is in progress: engine errors are handled by it. */
  let recovering = false

  /**
   * The shared audio engine, created lazily (it needs the browser) and wired
   * once: its events become reactive state, `ended` is handed to the store,
   * and errors trigger the expired-URL recovery.
   */
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
      // A pause fired while loading/erroring must not hide those states.
      if (status.value === 'playing') status.value = 'paused'
    })
    e.on('buffering', (waiting) => {
      buffering.value = waiting
      // Audio is flowing again: a later failure may be recovered once more.
      if (!waiting) sourceRecovered = false
    })
    e.on('ended', () => {
      if (!onEnded()) status.value = 'paused'
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

  /** Puts the player in the error state with a message for the bar. */
  function fail(message: string): void {
    status.value = 'error'
    error.value = message
  }

  // --- Signed URLs ---------------------------------------------------------------------

  /** The loaded signed URL is expired, or about to (less than a minute left). */
  function sourceExpired(): boolean {
    return Date.now() > sourceExpiresAt - SOURCE_EXPIRY_MARGIN_MS
  }

  /**
   * Puts a signed URL in the engine, remembers its expiry and moves to
   * `position` (applied by the element as soon as the metadata is in).
   */
  function applySource(playback: PlaybackSource, position: number): void {
    const e = engine()
    e.load(playback.url)
    sourceExpiresAt = Date.parse(playback.expiresAt) || 0
    if (position > 0) e.seek(position)
  }

  /** Loads a fresh signed URL for `trackId` into the engine, starting at `position`. */
  async function loadSource(trackId: string, position: number, token: number): Promise<boolean> {
    const playback = await source().playback(trackId)
    if (token !== loadToken) return false
    applySource(playback, position)
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
    catch (err) {
      // Paused while the fresh source was starting: recovered, just not playing.
      return isInterrupted(err)
    }
    finally {
      recovering = false
    }
  }

  // --- Commands ------------------------------------------------------------------------

  /**
   * Loads `item` (fresh data and URL from the source) in place of the
   * current track; `position` resumes inside it. A later load supersedes
   * this one: its late responses are ignored.
   */
  async function load(item: QueueItem, autoplay: boolean, position = 0): Promise<void> {
    const token = ++loadToken
    const e = engine()

    e.pause()
    status.value = 'loading'
    error.value = null
    currentTime.value = 0
    duration.value = item.durationSeconds ?? 0
    sourceRecovered = false

    try {
      const from = source()
      const [detail, playback] = await Promise.all([from.get(item.id), from.playback(item.id)])
      if (token !== loadToken) return
      // Audio source first, then the current track: the waveform mounted when
      // `current` changes already finds the audio element on the right file.
      applySource(playback, position)
      if (position > 0) currentTime.value = position
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
        if (token !== loadToken || isInterrupted(err)) return
        if (!(await recoverSource(true))) throw err
      }
    }
    catch (err) {
      if (token !== loadToken) return
      fail(getErrorMessage(err, 'Could not play the track'))
    }
  }

  /**
   * Resumes playback. After an error it reloads the track (through the
   * store, which knows the queue); with an expired URL it first loads a
   * fresh one at the same position; if the browser refuses to play, it tries
   * one reload before giving up.
   */
  async function play(): Promise<void> {
    if (status.value === 'idle' || status.value === 'loading') return
    if (status.value === 'error') return reload()

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
      if (isInterrupted(err)) return
      if (!(await recoverSource(true))) fail(getErrorMessage(err, 'Could not start playback'))
    }
  }

  /** Pauses (no-op unless playing). */
  function pause(): void {
    if (status.value === 'playing') engine().pause()
  }

  /** Play/pause button. */
  async function togglePlay(): Promise<void> {
    if (status.value === 'playing') pause()
    else await play()
  }

  /** Stop button: pause and back to the start, keeping the track loaded. */
  function stop(): void {
    if (!isActive.value) return
    engine().stop()
    currentTime.value = 0
    if (status.value === 'playing') status.value = 'paused'
  }

  /**
   * Starts the loaded track again from 0:00 without reloading it ("repeat
   * one"). An expired URL is replaced first, at 0:00 (seeking it would make
   * the browser request the file again and fail).
   */
  async function replay(): Promise<void> {
    currentTime.value = 0
    if (sourceExpired()) {
      sourceRecovered = false
      if (!(await recoverSource(true, 0))) fail('Could not replay the track')
      return
    }
    engine().seek(0)
    await play()
  }

  /**
   * Moves the position. The UI updates at once; with an expired URL the
   * source is reloaded at that position (seeking makes the browser request
   * the file again, which would fail).
   */
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

  /** Sets the volume (0..1, remembered); raising it above 0 also unmutes. */
  function setVolume(value: number): void {
    volume.value = clamp(value, 0, 1)
    engine().setVolume(volume.value)
    if (volume.value > 0 && muted.value) setMuted(false)
    storeVolume(volume.value)
  }

  /** Mutes or unmutes without touching the volume level. */
  function setMuted(value: boolean): void {
    muted.value = value
    engine().setMuted(value)
  }

  /** Mute button. */
  function toggleMute(): void {
    setMuted(!muted.value)
  }

  /** Changes the playback speed, keeping the pitch (e.g. 0.75 while syncing lyrics). */
  function setPlaybackRate(rate: number): void {
    const value = clamp(rate, MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE)
    if (value === playbackRate.value) return
    playbackRate.value = value
    engine().setPlaybackRate(value)
  }

  /**
   * Drops the audio source and goes back to idle (player closed). Pending
   * loads are discarded; the volume and mute stay, the speed goes back to 1.
   */
  function reset(): void {
    loadToken++
    if (engineRef) engineRef.unload()
    current.value = null
    status.value = 'idle'
    currentTime.value = 0
    duration.value = 0
    error.value = null
    sourceExpiresAt = 0
    sourceRecovered = false
    if (playbackRate.value !== 1) {
      playbackRate.value = 1
      engineRef?.setPlaybackRate(1)
    }
  }

  return {
    current, status, buffering, currentTime, duration, volume, muted, playbackRate, error,
    isActive, isPlaying, progress,
    load, play, pause, togglePlay, stop, replay, seek, setVolume, setMuted, toggleMute, setPlaybackRate, reset,
  }
}

/**
 * play() was cut short on purpose: a pause (or a new source) came before the
 * audio started. Browsers reject it with an AbortError; it is not a failure.
 */
function isInterrupted(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}
