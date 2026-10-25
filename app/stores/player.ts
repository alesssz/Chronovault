import { defineStore, skipHydrate } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { SharedTrack, TrackDetail } from '~~/shared/types/track'
import type { SharedPlaylist } from '~~/shared/types/playlist'
import { createPlayback } from '~/lib/player/playback'
import { createPlayQueue } from '~/lib/player/queue'
import { readStoredModes, REPEAT_MODES, storeModes } from '~/lib/player/settings'
import { librarySource, sharedPlaylistSource, sharedTrackSource, type TrackSource } from '~/lib/player/sources'
import type { QueueItem, QueueResult, RepeatMode } from '~/lib/player/types'
import { inOriginalOrder } from '~/lib/queue-order'

// The player's types, for components (they live with the player's parts).
export type { PlayerStatus, PlayerTrack, QueueItem, QueueResult, RepeatMode } from '~/lib/player/types'
export type { TrackSource } from '~/lib/player/sources'

/** Past this point (seconds) "previous" restarts the track instead of going back. */
const RESTART_THRESHOLD = 3
/**
 * Seconds before the end of a track at which the next one is asked for
 * (half-way through a track shorter than twice this): early enough for slow
 * networks, late enough not to ask for tracks that get skipped.
 */
const PREFETCH_LEAD_SECONDS = 20

/**
 * Player state shared by the whole app (bottom bar, expanded view, lyrics
 * editor, public pages). It puts together the player's parts, each in
 * app/lib/player/:
 *
 * - `queue.ts`: the play queue and its order (shuffle, Up next edits);
 * - `playback.ts`: the loaded track and the audio engine (status, time,
 *   volume, speed, expired signed URLs);
 * - `sources.ts`: where tracks come from (library, shared track or playlist);
 * - `settings.ts`: volume, shuffle and repeat remembered on the device.
 *
 * What is left here are the rules that need several parts at once: which
 * track to load when (next, previous, repeat) and which one to ask for
 * ahead (comingNext), shuffle and repeat, the public pages' players, and the
 * full-screen and Up next flags. Components
 * see one store with one flat API, whatever part holds the state.
 */
export const usePlayerStore = defineStore('player', () => {
  /** Where the queued tracks come from: the library, or a shared link. */
  let source: TrackSource = librarySource
  /** Key of the current source (see TrackSource): lets public pages know the player is theirs. */
  const sourceKey = ref(librarySource.key)

  /** Shuffle and repeat saved by the previous visit. */
  const storedModes = readStoredModes()
  // Settings read from this browser's storage. skipHydrate (where they are
  // returned): a server-rendered page (/t, /p) must not replace them with the
  // server's defaults.
  /** Shuffle is on: upcoming tracks play in random order (library playback only). */
  const shuffle = ref(storedModes.shuffle)
  /** Repeat mode (library playback only). */
  const repeat = ref<RepeatMode>(storedModes.repeat)

  /** The full-screen view (PlayerExpanded) is open. */
  const expanded = ref(false)
  /** The "Up next" panel (PlayerQueue) is open. */
  const queueOpen = ref(false)

  /** The play queue and its order. */
  const playQueue = createPlayQueue()
  // The queue state the rules below read most, under short names (they are the same refs).
  const { queue, index, originalOrder } = playQueue
  /** The loaded track and the audio engine. */
  const playback = createPlayback({
    // A getter, not a value: `source` changes when a public page takes the player over.
    source: () => source,
    // Resuming after an error loads the current queue track again: only the store knows which it is.
    reload: () => loadIndex(index.value, true),
    // Repeat, next track or stop: the store's call (see onEnded below).
    onEnded,
  })
  // Play/pause, which several commands below fall back to (the same function, under a short name).
  const { togglePlay } = playback
  // The playback state the rules below read most, under short names (the same refs).
  const { current, status, currentTime, isActive } = playback

  // --- Derived state ------------------------------------------------------------------
  /**
   * The track to show: the loaded one, or while it loads (no full data yet)
   * its summary from the queue. Null when idle.
   */
  const displayTrack = computed<QueueItem | null>(() => current.value ?? queue.value[index.value] ?? null)
  /** Shuffle and repeat apply: library playback (public pages play their list in order). */
  const modesApply = computed(() => sourceKey.value === librarySource.key)
  /** "Repeat all" is in effect: the queue starts again after its last track. */
  const loops = computed(() => modesApply.value && repeat.value === 'all' && queue.value.length > 0)
  /** There is a track after the current one, or the queue loops ("next" enabled). */
  const hasNext = computed(() => loops.value || index.value < queue.value.length - 1)
  /** There is a track before the current one, or the queue loops. */
  const hasPrevious = computed(() => loops.value || index.value > 0)
  /** Queue editing ("Play next", "Add to queue", the Up next panel) applies to library playback only. */
  const queueEditable = computed(() => isActive.value && sourceKey.value === librarySource.key)

  // --- The next track, asked for ahead ------------------------------------------------
  /**
   * The track that will start by itself when the current one ends, when it
   * can be known now: the next in the queue; at the end of a looping queue,
   * the first of the new round. None with "repeat one" (the same track starts
   * again), at the end of a queue that stops, or for a new round while
   * shuffled (its order is drawn only then).
   */
  const comingNext = computed<QueueItem | null>(() => {
    if (index.value < 0 || (modesApply.value && repeat.value === 'one')) return null
    if (index.value < queue.value.length - 1) return queue.value[index.value + 1] ?? null
    if (!loops.value || queue.value.length < 2 || shuffle.value) return null
    // The new round: in the list's order when shuffle was on once, otherwise as it is (see newRound).
    return (originalOrder.value ? inOriginalOrder(queue.value, originalOrder.value) : queue.value)[0] ?? null
  })

  // A little before the end, the next track's data and address are asked for, so it
  // starts at once when this one ends (see prefetch in lib/player/playback.ts). The
  // watched value changes only when the moment comes or the next track changes (Up next
  // edited, shuffle): the position moving alone asks nothing. While paused, nothing is
  // asked: the track may never be finished.
  watch(() => {
    // The track that would start by itself.
    const next = comingNext.value
    // The current track's length (0 until known).
    const length = playback.duration.value
    if (!next || status.value !== 'playing' || length <= 0) return null
    // 20 seconds before the end, or half-way through a track shorter than 40.
    return currentTime.value >= length - Math.min(PREFETCH_LEAD_SECONDS, length / 2) ? next : null
  }, (next) => {
    if (next) playback.prefetch(next)
  })

  // --- Moving through the queue ---------------------------------------------------------

  /** Makes queue item `i` the current track and loads it; `position` resumes inside the track. */
  async function loadIndex(i: number, autoplay: boolean, position = 0): Promise<void> {
    // That track's queued summary (nothing to load past the end of the queue).
    const item = queue.value[i]
    if (!item) return
    index.value = i
    await playback.load(item, autoplay, position)
  }

  /** A track ended: repeat it, move on, or (returning false) stay paused at the end of the queue. */
  function onEnded(): boolean {
    if (modesApply.value && repeat.value === 'one') void playback.replay()
    else if (hasNext.value) void next()
    else return false
    return true
  }

  /** Switches the source of the queue (library, shared track, shared playlist). */
  function setSource(next: TrackSource): void {
    source = next
    sourceKey.value = next.key
    // Only library playback is shuffled: a shared list has no original order to keep.
    if (next !== librarySource) playQueue.forgetOriginalOrder()
  }

  /** Plays `track`, using `context` (e.g. the library) as the queue. */
  async function playTrack(track: QueueItem, context: QueueItem[] = [track]): Promise<void> {
    if (current.value?.id === track.id && source === librarySource && status.value !== 'error') {
      await togglePlay()
      return
    }
    setSource(librarySource)
    await loadIndex(playQueue.startList(track, context, shuffle.value), true)
  }

  /** Plays a whole list ("Play" on a playlist): from its first track, or from a random one while shuffled. */
  async function playAll(list: QueueItem[]): Promise<void> {
    // Where the list starts: its first track, or a random one while shuffled.
    const start = shuffle.value ? list[Math.floor(Math.random() * list.length)] : list[0]
    if (start) await playTrack(start, list)
  }

  /** Loads a track shared by link without starting it (public share page). */
  async function cueShared(track: SharedTrack): Promise<void> {
    setSource(sharedTrackSource(track))
    playQueue.replace([track])
    await loadIndex(0, false)
  }

  /**
   * Plays a shared playlist from `index` (public playlist page); with
   * `autoplay: false` the track is only loaded. On the track already loaded
   * it toggles play/pause instead.
   */
  async function playSharedPlaylist(playlist: SharedPlaylist, index = 0, autoplay = true): Promise<void> {
    // The playlist's source key: is the player already on this playlist?
    const key = sharedPlaylistSource(playlist).key
    // The track asked for (none past the end of the playlist).
    const track = playlist.tracks[index]
    if (!track) return
    if (sourceKey.value === key && current.value?.id === track.id && status.value !== 'error') {
      if (autoplay) await togglePlay()
      return
    }
    setSource(sharedPlaylistSource(playlist))
    playQueue.replace(playlist.tracks)
    await loadIndex(index, autoplay)
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
    if (currentTime.value > RESTART_THRESHOLD) playback.seek(0)
    else if (index.value > 0) await loadIndex(index.value - 1, true)
    else if (loops.value && queue.value.length > 1) await loadIndex(queue.value.length - 1, true)
    else playback.seek(0)
  }

  /**
   * "Repeat all" after the last track: back to the first one, reshuffled
   * when shuffle is on, in the original order when it was turned off. A
   * single track simply starts again in place.
   */
  async function startNewRound(): Promise<void> {
    if (queue.value.length === 1) return playback.replay()
    playQueue.newRound(shuffle.value)
    await loadIndex(0, true)
  }

  // --- Shuffle and repeat -------------------------------------------------------------

  /**
   * Shuffle button (remembered). With library playback the upcoming tracks
   * are reordered at once; on a public page only the setting changes.
   */
  function setShuffle(on: boolean): void {
    if (on === shuffle.value) return
    shuffle.value = on
    storeModes({ shuffle: shuffle.value, repeat: repeat.value })
    if (!modesApply.value || index.value < 0) playQueue.forgetOriginalOrder()
    else if (on) playQueue.shuffleOn()
    else playQueue.shuffleOff()
  }

  /** Repeat button: off → all → one → off (remembered). */
  function cycleRepeat(): void {
    repeat.value = REPEAT_MODES[(REPEAT_MODES.indexOf(repeat.value) + 1) % REPEAT_MODES.length]!
    storeModes({ shuffle: shuffle.value, repeat: repeat.value })
  }

  // --- Views --------------------------------------------------------------------------

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
    playback.reset()
    playQueue.clear()
    expanded.value = false
    queueOpen.value = false
    setSource(librarySource)
  }

  // --- Editable queue ---------------------------------------------------------------
  // Library playback only: a public page's player plays its list as it is.
  // Without a library track loaded, adding a track simply plays it.

  /** True when queue editing applies: a library track is loaded (not a public page's player). */
  function canEditQueue(): boolean {
    return queueEditable.value && index.value >= 0
  }

  /** Puts `track` right after the current one (moving it there if it is already queued). */
  async function playNext(track: QueueItem): Promise<QueueResult> {
    if (!canEditQueue()) {
      await playTrack(track)
      return 'started'
    }
    return playQueue.insertNext(track)
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
    return playQueue.append(track, shuffle.value)
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
    // The order to go back to; with shuffle on and none saved (an old format), the current one.
    playQueue.replace(items, originalIds ?? (shuffle.value ? items.map(t => t.id) : null))
    await loadIndex(at, false, position)
    if (status.value === 'error') {
      close()
      return false
    }
    return true
  }

  // --- Library changes ----------------------------------------------------------------

  /** Refreshes track data after an edit in the editor. */
  function syncTrack(detail: TrackDetail): void {
    if (current.value?.id === detail.id) current.value = detail
    playQueue.refresh(detail)
  }

  /** Removes a deleted track from the queue (and closes the player if it was playing). */
  function removeTrack(id: string): void {
    if (current.value?.id === id) close()
    else playQueue.drop(id)
  }

  // One flat API whatever part holds the state. The parts' refs are returned
  // as they are (not copied), so Pinia sees them as the store's state and
  // components read and watch them like before the split.
  return {
    // state
    queue, index, current, status, currentTime, originalOrder, expanded, queueOpen, sourceKey,
    buffering: playback.buffering, duration: playback.duration, muted: playback.muted,
    playbackRate: playback.playbackRate, error: playback.error,
    // Read from this browser's storage: kept out of server-rendered state (see shuffle and repeat above).
    volume: skipHydrate(playback.volume), shuffle: skipHydrate(shuffle), repeat: skipHydrate(repeat),
    // derived
    isActive, displayTrack, hasNext, hasPrevious, queueEditable,
    isPlaying: playback.isPlaying, progress: playback.progress, upcoming: playQueue.upcoming,
    // commands
    playTrack, playAll, cueShared, playSharedPlaylist, togglePlay, next, previous, restoreQueue,
    playNext, addToQueue, playFromQueue, setShuffle, cycleRepeat, setExpanded, setQueueOpen, close, syncTrack, removeTrack,
    play: playback.play, pause: playback.pause, stop: playback.stop, seek: playback.seek,
    setVolume: playback.setVolume, setMuted: playback.setMuted, toggleMute: playback.toggleMute, setPlaybackRate: playback.setPlaybackRate,
    moveInQueue: playQueue.move, removeFromQueue: playQueue.removeAt, clearUpcoming: playQueue.clearUpcoming,
  }
})
