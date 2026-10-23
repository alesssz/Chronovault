import { defineStore, skipHydrate } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { PlaybackSource, SharedTrack, TrackDetail, TrackSummary } from '~~/shared/types/track'
import type { SharedPlaylist } from '~~/shared/types/playlist'
import { moveItem } from '~~/shared/utils/arrays'
import { clamp } from '~~/shared/utils/numbers'
import { getAudioEngine, type PlaybackEngine } from '~/lib/audio-engine'
import { inOriginalOrder, randomUpcomingSlot, shuffledRound, shuffleUpcoming, unshuffleUpcoming } from '~/lib/queue-order'
import { sharedApi, tracksApi } from '~/services/api'
import { getErrorMessage } from '~/utils/errors'

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
 * full-screen view.
 */
export type PlayerTrack = QueueItem & Pick<TrackDetail, 'lyrics' | 'lyricsSynced' | 'peaks' | 'description'>

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
/** localStorage key of the volume, remembered across visits like shuffle and repeat. */
const VOLUME_KEY = 'chronoplayer:volume'
/** localStorage key of shuffle and repeat (remembered like the volume). */
const MODES_KEY = 'chronoplayer:playback-modes'
/** Repeat modes in the order the button cycles through them. */
const REPEAT_MODES: readonly RepeatMode[] = ['off', 'all', 'one']
/** A signed URL this close to its expiry is replaced before being used again. */
const SOURCE_EXPIRY_MARGIN_MS = 60_000
/** Playback speed bounds (the sync editor uses 0.5 and 0.75). */
const MIN_PLAYBACK_RATE = 0.25
/** Upper speed bound (no UI uses more than 1× today; kept generous for the API). */
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
  /** Lifecycle of the player (see PlayerStatus). */
  const status = ref<PlayerStatus>('idle')
  /** The element is waiting for data (spinner on the play button). */
  const buffering = ref(false)
  /** Position in seconds, updated every animation frame while playing. */
  const currentTime = ref(0)
  /** From the track data at first, then from the audio element once known. */
  const duration = ref(0)
  // Settings read from this browser's storage. skipHydrate: a server-rendered
  // page (/t, /p) must not replace them with the server's defaults.
  /** 0..1, restored from the previous visit. */
  const volume = skipHydrate(ref(readStoredVolume()))
  /** Mute is separate from the volume, so unmuting brings the old level back. */
  const muted = ref(false)
  /** Playback speed (1 = normal); slowed down while syncing lyrics. */
  const playbackRate = ref(1)
  /** Shuffle and repeat saved by the previous visit. */
  const storedModes = readStoredModes()
  /** Shuffle is on: upcoming tracks play in random order (library playback only). */
  const shuffle = skipHydrate(ref(storedModes.shuffle))
  /** Repeat mode (library playback only). */
  const repeat = skipHydrate(ref<RepeatMode>(storedModes.repeat))
  /**
   * Track ids of the queue in its order before it was first shuffled (plus
   * tracks added since), to put it back when shuffle is turned off and for
   * the new rounds of "repeat all" after that. Null for a list never
   * shuffled, a shared list, or when nothing plays.
   */
  const originalOrder = ref<string[] | null>(null)
  /** The full-screen view (PlayerExpanded) is open. */
  const expanded = ref(false)
  /** The "Up next" panel (PlayerQueue) is open. */
  const queueOpen = ref(false)
  /** Message of the last failure (status 'error'), shown in the player bar. */
  const error = ref<string | null>(null)
  /** Key of the current source (see TrackSource): lets public pages know the player is theirs. */
  const sourceKey = ref(librarySource.key)

  // --- Derived state ------------------------------------------------------------------
  /** Something is loaded (or loading): the player bar is shown. */
  const isActive = computed(() => status.value !== 'idle')
  /**
   * The track to show: the loaded one, or while it loads (no full data yet)
   * its summary from the queue. Null when idle.
   */
  const displayTrack = computed<QueueItem | null>(() => current.value ?? queue.value[index.value] ?? null)
  /** Audio is playing right now (Play/Pause icons). */
  const isPlaying = computed(() => status.value === 'playing')
  /** Shuffle and repeat apply: library playback (public pages play their list in order). */
  const modesApply = computed(() => sourceKey.value === librarySource.key)
  /** "Repeat all" is in effect: the queue starts again after its last track. */
  const loops = computed(() => modesApply.value && repeat.value === 'all' && queue.value.length > 0)
  /** There is a track after the current one, or the queue loops ("next" enabled). */
  const hasNext = computed(() => loops.value || index.value < queue.value.length - 1)
  /** There is a track before the current one, or the queue loops. */
  const hasPrevious = computed(() => loops.value || index.value > 0)
  /** Tracks after the current one, in play order. */
  const upcoming = computed(() => (index.value >= 0 ? queue.value.slice(index.value + 1) : []))
  /** Queue editing ("Play next", "Add to queue", the Up next panel) applies to library playback only. */
  const queueEditable = computed(() => isActive.value && sourceKey.value === librarySource.key)
  /** 0..1 position in the track, for the thin progress line of the mobile bar. */
  const progress = computed(() => (duration.value > 0 ? Math.min(1, currentTime.value / duration.value) : 0))

  // --- Non-reactive internals ----------------------------------------------------------
  /** The audio engine, wired to this store on first use (see engine()). */
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

  /**
   * The shared audio engine, created lazily (it needs the browser) and wired
   * to the store once: its events become reactive state, `ended` moves on to
   * the next track, and errors trigger the expired-URL recovery.
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
      if (modesApply.value && repeat.value === 'one') void replay()
      else if (hasNext.value) void next()
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

  /** Puts the player in the error state with a message for the bar. */
  function fail(message: string): void {
    status.value = 'error'
    error.value = message
  }

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
    const playback = await source.playback(trackId)
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

  /** Loads queue item `i` (fresh data and URL); `position` resumes inside the track. */
  async function loadIndex(i: number, autoplay: boolean, position = 0): Promise<void> {
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

  /** Plays `track`, using `context` (e.g. the library) as the queue. */
  async function playTrack(track: QueueItem, context: QueueItem[] = [track]): Promise<void> {
    if (current.value?.id === track.id && source === librarySource && status.value !== 'error') {
      await togglePlay()
      return
    }
    setSource(librarySource)
    let items = [...context]
    let i = items.findIndex(t => t.id === track.id)
    if (i === -1) {
      items = [track, ...items]
      i = 0
    }
    if (shuffle.value) {
      originalOrder.value = items.map(t => t.id)
      // The chosen track first, all the others of the list shuffled after it.
      items = shuffleUpcoming([items[i]!, ...items.filter((_, j) => j !== i)], 0)
      i = 0
    }
    queue.value = items
    await loadIndex(i, true)
  }

  /** Plays a whole list ("Play" on a playlist): from its first track, or from a random one while shuffled. */
  async function playAll(list: QueueItem[]): Promise<void> {
    const start = shuffle.value ? list[Math.floor(Math.random() * list.length)] : list[0]
    if (start) await playTrack(start, list)
  }

  /** Switches the source of the queue (library, shared track, shared playlist). */
  function setSource(next: TrackSource): void {
    source = next
    sourceKey.value = next.key
    // Only library playback is shuffled: a shared list has no original order to keep.
    if (next !== librarySource) originalOrder.value = null
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

  /**
   * Resumes playback. After an error it reloads the track; with an expired
   * URL it first loads a fresh one at the same position; if the browser
   * refuses to play, it tries one reload before giving up.
   */
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

  /** Next track of the queue, if any. */
  async function next(): Promise<void> {
    if (index.value < queue.value.length - 1) await loadIndex(index.value + 1, true)
    else if (loops.value) await startNewRound()
  }

  /**
   * Like every player: restarts the track after 3 s, otherwise goes to the
   * previous one (from the first, to the last when the queue loops).
   */
  async function previous(): Promise<void> {
    if (currentTime.value > RESTART_THRESHOLD) seek(0)
    else if (index.value > 0) await loadIndex(index.value - 1, true)
    else if (loops.value && queue.value.length > 1) await loadIndex(queue.value.length - 1, true)
    else seek(0)
  }

  /**
   * "Repeat all" after the last track: back to the first one, reshuffled
   * when shuffle is on, in the original order when it was turned off. A
   * single track simply starts again in place.
   */
  async function startNewRound(): Promise<void> {
    if (queue.value.length === 1) return replay()
    if (shuffle.value) queue.value = shuffledRound(queue.value, queue.value[index.value]?.id ?? '')
    else if (originalOrder.value) queue.value = inOriginalOrder(queue.value, originalOrder.value)
    await loadIndex(0, true)
  }

  /**
   * "Repeat one": the track that just ended starts again from 0:00 without
   * reloading it. An expired URL is replaced first, at 0:00 (seeking it
   * would make the browser request the file again and fail).
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
   * Shuffle button (remembered). With library playback the upcoming tracks
   * are reordered at once; on a public page only the setting changes.
   */
  function setShuffle(on: boolean): void {
    if (on === shuffle.value) return
    shuffle.value = on
    storeModes({ shuffle: shuffle.value, repeat: repeat.value })
    if (!modesApply.value || index.value < 0) {
      originalOrder.value = null
      return
    }
    if (on) {
      // Shuffled before: the list's real order is already known (the queue may be mixed by now).
      originalOrder.value ??= queue.value.map(t => t.id)
      queue.value = shuffleUpcoming(queue.value, index.value)
    }
    else if (originalOrder.value) {
      queue.value = unshuffleUpcoming(queue.value, index.value, originalOrder.value)
    }
  }

  /** Repeat button: off → all → one → off (remembered). */
  function cycleRepeat(): void {
    repeat.value = REPEAT_MODES[(REPEAT_MODES.indexOf(repeat.value) + 1) % REPEAT_MODES.length]!
    storeModes({ shuffle: shuffle.value, repeat: repeat.value })
  }

  /** Opens/closes the full-screen view (only while something is loaded). */
  function setExpanded(value: boolean): void {
    expanded.value = value && isActive.value
  }

  /** Opens/closes the Up next panel (only for library playback). */
  function setQueueOpen(value: boolean): void {
    queueOpen.value = value && queueEditable.value
  }

  /** Closes the player, clears the queue and drops the audio source. */
  function close(): void {
    loadToken++
    if (engineRef) engineRef.unload()
    queue.value = []
    index.value = -1
    originalOrder.value = null
    current.value = null
    status.value = 'idle'
    currentTime.value = 0
    duration.value = 0
    expanded.value = false
    queueOpen.value = false
    error.value = null
    sourceExpiresAt = 0
    sourceRecovered = false
    setSource(librarySource)
    if (playbackRate.value !== 1) {
      playbackRate.value = 1
      engineRef?.setPlaybackRate(1)
    }
  }

  // --- Editable queue ---------------------------------------------------------------
  // The queue holds the tracks already played (before `index`), the current one
  // and the upcoming ones (after `index`). A track appears at most once. Only
  // upcoming tracks are edited; `index` is kept pointing at the current track.

  /** True when queue editing applies: a library track is loaded (not a public page's player). */
  function canEditQueue(): boolean {
    return queueEditable.value && index.value >= 0
  }

  /** Removes `id` from the queue (unless current), keeping `index` on the current track. */
  function detach(id: string): void {
    const i = queue.value.findIndex(t => t.id === id)
    if (i === -1 || i === index.value) return
    queue.value = queue.value.filter((_, j) => j !== i)
    if (i < index.value) index.value--
  }

  /** A track added while shuffled joins the original order too (at its end). */
  function rememberOriginal(id: string): void {
    if (originalOrder.value && !originalOrder.value.includes(id)) originalOrder.value = [...originalOrder.value, id]
  }

  /** Puts `track` right after the current one (moving it there if it is already queued). */
  async function playNext(track: QueueItem): Promise<QueueResult> {
    if (!canEditQueue()) {
      await playTrack(track)
      return 'started'
    }
    if (queue.value[index.value]?.id === track.id) return 'current'
    detach(track.id)
    // A new array (never mutate in place): watchers and the saved queue see the change.
    const updated = [...queue.value]
    updated.splice(index.value + 1, 0, track)
    queue.value = updated
    rememberOriginal(track.id)
    return 'queued'
  }

  /**
   * Appends `track` at the end of the queue (at a random place among the
   * upcoming tracks while shuffled). A track already coming up stays where
   * it is; one already played is moved.
   */
  async function addToQueue(track: QueueItem): Promise<QueueResult> {
    if (!canEditQueue()) {
      await playTrack(track)
      return 'started'
    }
    const i = queue.value.findIndex(t => t.id === track.id)
    if (i === index.value) return 'current'
    if (i > index.value) return 'already-queued'
    detach(track.id)
    if (shuffle.value) {
      const updated = [...queue.value]
      updated.splice(randomUpcomingSlot(updated.length, index.value), 0, track)
      queue.value = updated
      rememberOriginal(track.id)
    }
    else {
      queue.value = [...queue.value, track]
    }
    return 'queued'
  }

  /** Moves an upcoming track from position `from` to `to` (absolute queue positions, both after the current track). */
  function moveInQueue(from: number, to: number): void {
    const last = queue.value.length - 1
    if (from === to || from <= index.value || to <= index.value || from > last || to > last) return
    // A new array (never mutate in place): watchers and the saved queue see the change.
    queue.value = moveItem(queue.value, from, to)
  }

  /** Removes an upcoming track from the queue (the current one cannot be removed this way). */
  function removeFromQueue(position: number): void {
    if (position <= index.value || position >= queue.value.length) return
    queue.value = queue.value.filter((_, j) => j !== position)
  }

  /** Drops every upcoming track: playback stops after the current one. */
  function clearUpcoming(): void {
    if (index.value < 0) return
    queue.value = queue.value.slice(0, index.value + 1)
  }

  /** Jumps to a track of the queue and plays it. */
  async function playFromQueue(position: number): Promise<void> {
    if (position === index.value) {
      await togglePlay()
      return
    }
    if (queue.value[position]) await loadIndex(position, true)
  }

  /**
   * Puts back a saved library queue (app/lib/queue-storage.ts), loaded and
   * paused at `position`; `originalIds` is its order before shuffling.
   * Does nothing if something is already playing; a track that cannot be
   * loaded makes it give up and close the player.
   */
  async function restoreQueue(items: QueueItem[], at: number, position: number, originalIds?: string[]): Promise<boolean> {
    if (isActive.value || !items[at]) return false
    setSource(librarySource)
    queue.value = [...items]
    // The order to go back to; with shuffle on and none saved (an old format), the current one.
    originalOrder.value = originalIds ?? (shuffle.value ? items.map(t => t.id) : null)
    await loadIndex(at, false, position)
    if (status.value === 'error') {
      close()
      return false
    }
    return true
  }

  /** Refreshes track data after an edit in the editor. */
  function syncTrack(detail: TrackDetail): void {
    if (current.value?.id === detail.id) current.value = detail
    const i = queue.value.findIndex(t => t.id === detail.id)
    if (i !== -1) {
      // Merge the new summary fields into the queued item (title, cover…), on a copy.
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
    queue, index, current, status, buffering, currentTime, duration, volume, muted, playbackRate, shuffle, repeat, originalOrder, expanded, queueOpen, error, sourceKey,
    // derived
    isActive, displayTrack, isPlaying, hasNext, hasPrevious, progress, upcoming, queueEditable,
    // commands
    playTrack, playAll, cueShared, playSharedPlaylist, play, pause,
    playNext, addToQueue, moveInQueue, removeFromQueue, clearUpcoming, playFromQueue, restoreQueue, togglePlay, stop, next, previous, seek,
    setVolume, setMuted, toggleMute, setPlaybackRate, setShuffle, cycleRepeat, setExpanded, setQueueOpen, close, syncTrack, removeTrack,
  }
})

/**
 * play() was cut short on purpose: a pause (or a new source) came before the
 * audio started. Browsers reject it with an AbortError; it is not a failure.
 */
function isInterrupted(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

/** The TrackSummary part of a TrackDetail (to refresh a queue item after an edit). */
function pickSummary(detail: TrackDetail): TrackSummary {
  const {
    description: _d, sunoPrompt: _s, lyrics: _l, lyricsSynced: _ls, peaks: _p,
    mimeType: _m, sizeBytes: _sb, audioPath: _a, coverPath: _c, ...summary
  } = detail
  return summary
}

/** Volume saved by the previous visit (1 when absent, invalid or storage is blocked). */
function readStoredVolume(): number {
  try {
    const raw = globalThis.localStorage?.getItem(VOLUME_KEY)
    const value = raw == null ? Number.NaN : Number(raw)
    return Number.isFinite(value) ? clamp(value, 0, 1) : 1
  }
  catch {
    return 1
  }
}

/** Remembers the volume for the next visit (best effort). */
function storeVolume(value: number): void {
  try {
    globalThis.localStorage?.setItem(VOLUME_KEY, String(value))
  }
  catch {
    // Storage unavailable (e.g. private browsing): the volume is not remembered.
  }
}

/** Shuffle and repeat saved by the previous visit (both off when absent, invalid or storage is blocked). */
function readStoredModes(): { shuffle: boolean, repeat: RepeatMode } {
  try {
    const raw = globalThis.localStorage?.getItem(MODES_KEY)
    const value = (raw ? JSON.parse(raw) : {}) as { shuffle?: unknown, repeat?: unknown }
    return {
      shuffle: value.shuffle === true,
      repeat: REPEAT_MODES.find(mode => mode === value.repeat) ?? 'off',
    }
  }
  catch {
    return { shuffle: false, repeat: 'off' }
  }
}

/** Remembers shuffle and repeat for the next visit (best effort). */
function storeModes(modes: { shuffle: boolean, repeat: RepeatMode }): void {
  try {
    globalThis.localStorage?.setItem(MODES_KEY, JSON.stringify(modes))
  }
  catch {
    // Storage unavailable (e.g. private browsing): the modes are not remembered.
  }
}
