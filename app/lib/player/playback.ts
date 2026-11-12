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
 * The next track can be asked for ahead (prefetch, called by the store a
 * little before the end): load() then finds its data and address ready and
 * starts it in the same moment the previous one ended, with no network wait.
 *
 * The actual audio lives in the engine (`getAudioEngine`, one `<audio>`
 * element outside Vue): this part only holds reactive state and commands.
 */
import { computed, ref, shallowRef } from 'vue'
import type { PlaybackSource } from '~~/shared/types/track'
import { clamp } from '~~/shared/utils/numbers'
import { getAudioEngine, pageControlsVolume, type PlaybackEngine } from '~/lib/audio-engine'
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
  /**
   * 0..1, restored from the previous visit where the page offers a volume of
   * its own; always 1 on touch screens, where the hardware buttons own it
   * (pageControlsVolume): a low level saved there could not be raised again.
   */
  const volume = ref(pageControlsVolume() ? readStoredVolume() : 1)
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
  /**
   * Goes up each time the loaded track starts over without being loaded
   * again: a replay ("repeat one", or "repeat all" on a single track), or
   * play pressed once it has ended. The play counter
   * (app/plugins/play-counter.client.ts) starts afresh at each change: one
   * more listen of the same track is measured on its own, as a new one (what
   * the server adds is its call: one row per listener, track and day).
   */
  const listen = ref(0)

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
   * Incremented by every source reload: a reload answered after a newer one
   * started is stale and applies nothing. A seek and a Play on an expired
   * track each start one; the seek's, answering last, used to put its
   * address in the element after the Play's and leave the track paused.
   */
  let recoveryRound = 0
  /**
   * Whether the track being loaded starts once it is in: load()'s `autoplay`,
   * then whatever play, pause or play/pause pressed meanwhile asked for. The
   * play button is disabled while loading, but other controls are not (a
   * share page's big Play button, the keyboard, the lock screen): before, a
   * press there during the load did nothing, and the track then sat paused.
   */
  let autoplayWanted = false
  /** The loaded track played to its end and stayed there (no next track): playing it again is a new listen. */
  let endedHere = false

  /**
   * The shared audio engine, created lazily (it needs the browser) and wired
   * once: its events become reactive state, `ended` is handed to the store,
   * and errors trigger the expired-URL recovery.
   */
  function engine(): PlaybackEngine {
    if (engineRef) return engineRef
    // The app-wide engine, wired to this player below, once.
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
      if (onEnded()) return
      status.value = 'paused'
      endedHere = true
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
    // The engine the address goes into.
    const e = engine()
    e.load(playback.url)
    sourceExpiresAt = Date.parse(playback.expiresAt) || 0
    if (position > 0) e.seek(position)
  }

  /**
   * Loads a fresh signed URL for `trackId` into the engine, starting at
   * `position`; false when a newer load (`token`) or, for a source reload,
   * a newer reload (`round`, see recoveryRound) took over meanwhile.
   */
  async function loadSource(trackId: string, position: number, token: number, round?: number): Promise<boolean> {
    // A fresh signed address, from the current source.
    const playback = await source().playback(trackId)
    // A newer load, or (for a reload) a newer reload, took over meanwhile: this answer is stale.
    if (token !== loadToken || (round !== undefined && round !== recoveryRound)) return false
    applySource(playback, position)
    return true
  }

  /**
   * Replaces the current source with a fresh signed URL at the current
   * position, at most once per source. Resolves to false when it gives up.
   * A newer reload supersedes it: its late answer then applies nothing.
   */
  async function recoverSource(
    resume: boolean,
    // The element's own position by default: the waveform may have just moved it. While
    // another reload is on its way the element was not moved (a seek on an expired address
    // only sets the shown position), so the position shown is the one to resume at.
    position = recovering ? currentTime.value : engine().currentTime || currentTime.value,
  ): Promise<boolean> {
    // The loaded track: without one there is nothing to recover.
    const track = current.value
    if (!track || sourceRecovered) return false
    sourceRecovered = true
    recovering = true
    // The load this recovery belongs to: a newer load makes it moot.
    const token = loadToken
    // This reload's round: a newer reload makes it moot too.
    const round = ++recoveryRound
    try {
      if (!(await loadSource(track.id, position, token, round))) return true
      if (resume) await engine().play()
      else if (status.value !== 'paused') status.value = 'paused'
      return true
    }
    catch (err) {
      // Paused while the fresh source was starting: recovered, just not playing.
      return isInterrupted(err)
    }
    finally {
      // The latest reload says when reloading is over (an older one ending changes nothing).
      if (round === recoveryRound) recovering = false
    }
  }

  // --- The next track, asked for ahead ------------------------------------------------
  // When a track ends by itself, loading the next one used to start with two requests
  // (its data and its streaming address): a pause of a few hundred ms on the deployed
  // app, and with the screen off a play() that came only after a network wait, which some
  // browsers refuse in the background. The store asks for the next track a little before
  // the end (prefetch); load() then finds it ready and starts it in the same moment.

  /** A track's data and streaming address, as load() needs them. */
  interface TrackData {
    /** Everything the player shows about the track. */
    detail: PlayerTrack
    /** Its streaming address and when that expires. */
    playback: PlaybackSource
  }

  /** The track asked for ahead: one at most, the last one asked for. */
  interface Prepared {
    /** Which track, from which source (see preparedKey). */
    key: string
    /** The two requests, on their way or done. */
    promise: Promise<TrackData>
    /** Their answer once in (null until then): load() uses it without waiting. */
    ready: TrackData | null
  }
  /** The track asked for ahead, until load() takes it (or another one replaces it); null when none. */
  let prepared: Prepared | null = null

  /** Identifies a track of the current source: the same id from another source (a share page) is another track. */
  function preparedKey(trackId: string): string {
    return `${source().key}|${trackId}`
  }

  /** A track's data and streaming address from the current source, in parallel. */
  async function fetchTrack(trackId: string): Promise<TrackData> {
    // The source now (a share page may take the player over while the requests are out).
    const from = source()
    // Data and address, asked for in parallel.
    const [detail, playback] = await Promise.all([from.get(trackId), from.playback(trackId)])
    return { detail, playback }
  }

  /** The address expires within the safety margin: not worth starting with (see sourceExpired). */
  function expiresSoon(playback: PlaybackSource): boolean {
    return Date.now() > (Date.parse(playback.expiresAt) || 0) - SOURCE_EXPIRY_MARGIN_MS
  }

  /**
   * Asks for `item`'s data and address now, so that loading it later needs no
   * network wait. Asking for another track replaces it (the next one changed:
   * Up next edited, shuffle); asking again for the same one does nothing. A
   * failure is forgotten: load() then asks as usual.
   */
  function prefetch(item: QueueItem): void {
    // Which track, from which source.
    const key = preparedKey(item.id)
    if (prepared?.key === key) return
    // The request, started now; `ready` is set once it answers.
    const entry: Prepared = { key, promise: fetchTrack(item.id), ready: null }
    prepared = entry
    entry.promise.then(
      (data) => {
        entry.ready = data
      },
      () => {
        // Still the one waiting: forget it, so load() asks again.
        if (prepared === entry) prepared = null
      },
    )
  }

  /** What was asked for ahead for `item`, if anything: handed over once (load() takes it). */
  function claimPrepared(item: QueueItem): Prepared | null {
    // The one asked for ahead, if it is this very track.
    const entry = prepared?.key === preparedKey(item.id) ? prepared : null
    if (entry) prepared = null
    return entry
  }

  // --- Commands ------------------------------------------------------------------------

  /**
   * Loads `item` in place of the current track; `position` resumes inside
   * it. Its data and address come from what was asked for ahead (prefetch)
   * when there is any: already in, the track starts at once, in this very
   * call; still on its way, it is waited for; failed or about to expire, they
   * are asked for again. A later load supersedes this one: its late responses
   * are ignored.
   */
  async function load(item: QueueItem, autoplay: boolean, position = 0): Promise<void> {
    // This load's number: answers belonging to older loads are dropped.
    const token = ++loadToken
    // The engine (created on first use).
    const e = engine()
    // Asked for ahead (the store does it a little before a track ends).
    const ahead = claimPrepared(item)

    e.pause()
    status.value = 'loading'
    error.value = null
    currentTime.value = 0
    duration.value = item.durationSeconds ?? 0
    sourceRecovered = false
    // Start once in, unless a press during the load says otherwise (see play/pause/togglePlay).
    autoplayWanted = autoplay
    endedHere = false

    try {
      // Ready: no await at all here, so play() below runs in the same moment as the track
      // that just ended. Otherwise wait for it (asking again if it failed), or ask now (a
      // failure then is the load's own, reported as before).
      let { detail, playback } = ahead?.ready
        ?? await (ahead ? ahead.promise.catch(() => fetchTrack(item.id)) : fetchTrack(item.id))
      // Asked for long ago (a paused track): the address may be about to expire.
      if (expiresSoon(playback)) ({ detail, playback } = await fetchTrack(item.id))
      if (token !== loadToken) return
      // Audio source first, then the current track: the waveform mounted when
      // `current` changes already finds the audio element on the right file.
      applySource(playback, position)
      if (position > 0) currentTime.value = position
      current.value = detail
      if (detail.durationSeconds) duration.value = detail.durationSeconds
      // Read now, not from `autoplay`: play or pause may have been pressed while it loaded.
      if (!autoplayWanted) {
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
   * Resumes playback. While the track is still loading it starts once in;
   * after an error it reloads the track (through the store, which knows the
   * queue); with an expired URL it first loads a fresh one at the same
   * position; if the browser refuses to play, it tries one reload before
   * giving up. A track that had ended starts over: a new listen.
   */
  async function play(): Promise<void> {
    // Still loading: it starts once in (see autoplayWanted).
    if (status.value === 'loading') {
      autoplayWanted = true
      return
    }
    if (status.value === 'idle') return
    if (status.value === 'error') return reload()
    // Played to its end: the element starts over from 0:00, and that is a new listen.
    if (endedHere) {
      endedHere = false
      listen.value++
    }

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

  /** Pauses; while loading, the track will stay paused once in. No-op otherwise unless playing. */
  function pause(): void {
    if (status.value === 'loading') autoplayWanted = false
    else if (status.value === 'playing') engine().pause()
  }

  /**
   * Play/pause button. While loading it flips what happens once the track is
   * in: a track being cued paused (a share page on open) will start, one
   * about to start will stay paused.
   */
  async function togglePlay(): Promise<void> {
    if (status.value === 'loading') autoplayWanted = !autoplayWanted
    else if (status.value === 'playing') pause()
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
    // The same track from the start again: one more listen.
    listen.value++
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
    // Never before the start.
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
    // Within the speeds the player supports.
    const value = clamp(rate, MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE)
    if (value === playbackRate.value) return
    playbackRate.value = value
    engine().setPlaybackRate(value)
  }

  /**
   * The track's audio file was replaced (the editor's Replace audio): the old
   * file is about to be deleted, so the loaded track moves to the new one at
   * the same second, playing if it was, paused if it was (a fresh address from
   * the source, which now names the new file). A track asked for ahead is
   * forgotten, its address naming the old file. A track that is not the loaded
   * one needs nothing more: its next load asks for its address anyway.
   */
  async function reloadAudio(trackId: string): Promise<void> {
    if (prepared?.key === preparedKey(trackId)) prepared = null
    // Only the loaded track, once in: a load on its way asks for the address itself, an error reloads on Play.
    if (current.value?.id !== trackId || (status.value !== 'playing' && status.value !== 'paused')) return
    // Allowed even if this source already recovered once: this is a new file, not a retry.
    sourceRecovered = false
    if (!(await recoverSource(status.value === 'playing'))) fail('Could not load the new audio file')
  }

  /**
   * Drops the audio source and goes back to idle (player closed). Pending
   * loads are discarded; the volume and mute stay, the speed goes back to 1.
   */
  function reset(): void {
    loadToken++
    // Nothing comes next any more.
    prepared = null
    if (engineRef) engineRef.unload()
    current.value = null
    status.value = 'idle'
    currentTime.value = 0
    duration.value = 0
    error.value = null
    sourceExpiresAt = 0
    sourceRecovered = false
    endedHere = false
    if (playbackRate.value !== 1) {
      playbackRate.value = 1
      engineRef?.setPlaybackRate(1)
    }
  }

  return {
    current, status, buffering, currentTime, duration, volume, muted, playbackRate, error,
    isActive, isPlaying, progress, listen,
    load, prefetch, play, pause, togglePlay, stop, replay, seek, setVolume, setMuted, toggleMute, setPlaybackRate, reset,
    reloadAudio,
  }
}

/**
 * play() was cut short on purpose: a pause (or a new source) came before the
 * audio started. Browsers reject it with an AbortError; it is not a failure.
 */
function isInterrupted(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}
