/**
 * The play queue and its order, without any audio: which tracks come before
 * and after the current one, shuffle and its way back, and the edits of the
 * Up next panel ("Play next", "Add to queue", move, remove, clear).
 *
 * The queue holds the tracks already played (before `index`), the current one
 * and the upcoming ones (after `index`). A track appears at most once. Only
 * upcoming tracks are edited; `index` is kept pointing at the current track.
 *
 * Moving to another track (setting `index` and loading its audio) is the
 * store's job (app/stores/player.ts): this part only decides the order. The
 * pure shuffle rules live in app/lib/queue-order.ts.
 *
 * The arrays are always replaced, never mutated in place: watchers (the
 * saved queue, the Up next list) see every change.
 */
import { computed, ref } from 'vue'
import type { TrackDetail, TrackSummary } from '~~/shared/types/track'
import { moveItem } from '~~/shared/utils/arrays'
import { inOriginalOrder, randomUpcomingSlot, shuffledRound, shuffleUpcoming, unshuffleUpcoming } from '~/lib/queue-order'
import type { QueueItem } from './types'

/** Reactive play queue; create one per player (see the file comment). */
export function createPlayQueue() {
  /** Tracks that "next"/"previous" move through (the library view, a playlist…). */
  const queue = ref<QueueItem[]>([])
  /** Position of the current track in `queue`; -1 when idle. */
  const index = ref(-1)
  /**
   * Track ids of the queue in its order before it was first shuffled (plus
   * tracks added since), to put it back when shuffle is turned off and for
   * the new rounds of "repeat all" after that. Null for a list never
   * shuffled, a shared list, or when nothing plays.
   */
  const originalOrder = ref<string[] | null>(null)

  /** Tracks after the current one, in play order. */
  const upcoming = computed(() => (index.value >= 0 ? queue.value.slice(index.value + 1) : []))

  // --- Whole queue ---------------------------------------------------------------------

  /**
   * Makes `list` the queue to play `track` from, and returns the position
   * to play. A track missing from the list is put before it. With
   * `shuffled`, the list's order is remembered and the queue becomes the
   * chosen track followed by all the others, shuffled.
   */
  function startList(track: QueueItem, list: readonly QueueItem[], shuffled: boolean): number {
    // The new queue and the position to play, adjusted below.
    let items = [...list]
    let i = items.findIndex(t => t.id === track.id)
    if (i === -1) {
      items = [track, ...items]
      i = 0
    }
    if (shuffled) {
      originalOrder.value = items.map(t => t.id)
      // The chosen track first, all the others of the list shuffled after it.
      items = shuffleUpcoming([items[i]!, ...items.filter((_, j) => j !== i)], 0)
      i = 0
    }
    queue.value = items
    return i
  }

  /**
   * Puts `items` in the queue as they are (a shared list, a restored
   * queue); `original` is their order before shuffling, if any.
   */
  function replace(items: readonly QueueItem[], original: string[] | null = null): void {
    queue.value = [...items]
    originalOrder.value = original
  }

  /**
   * Reorders the queue for a new round of "repeat all": reshuffled when
   * `shuffled` (never starting with the track that just ended), in the
   * original order when shuffle was turned off, untouched otherwise.
   */
  function newRound(shuffled: boolean): void {
    if (shuffled) queue.value = shuffledRound(queue.value, queue.value[index.value]?.id ?? '')
    else if (originalOrder.value) queue.value = inOriginalOrder(queue.value, originalOrder.value)
  }

  /** Empties the queue (player closed). */
  function clear(): void {
    queue.value = []
    index.value = -1
    originalOrder.value = null
  }

  // --- Shuffle -------------------------------------------------------------------------

  /** Shuffle turned on while playing: the upcoming tracks are mixed, the list's order is kept. */
  function shuffleOn(): void {
    // Shuffled before: the list's real order is already known (the queue may be mixed by now).
    originalOrder.value ??= queue.value.map(t => t.id)
    queue.value = shuffleUpcoming(queue.value, index.value)
  }

  /** Shuffle turned off while playing: the upcoming tracks go back to the list's order, from the current one. */
  function shuffleOff(): void {
    if (originalOrder.value) queue.value = unshuffleUpcoming(queue.value, index.value, originalOrder.value)
  }

  /** Drops the original order: there is nothing to put back (a shared list, nothing playing). */
  function forgetOriginalOrder(): void {
    originalOrder.value = null
  }

  // --- Editing (Up next) ---------------------------------------------------------------

  /** Removes `id` from the queue (unless current), keeping `index` on the current track. */
  function detach(id: string): void {
    // Where the track is in the queue (-1: not there).
    const i = queue.value.findIndex(t => t.id === id)
    if (i === -1 || i === index.value) return
    queue.value = queue.value.filter((_, j) => j !== i)
    if (i < index.value) index.value--
  }

  /** A track added while shuffled joins the original order too (at its end). */
  function rememberOriginal(id: string): void {
    if (originalOrder.value && !originalOrder.value.includes(id)) originalOrder.value = [...originalOrder.value, id]
  }

  /** "Play next": puts `track` right after the current one (moving it there if it is already queued). */
  function insertNext(track: QueueItem): 'current' | 'queued' {
    if (queue.value[index.value]?.id === track.id) return 'current'
    detach(track.id)
    // A copy, so watchers see a new array.
    const updated = [...queue.value]
    updated.splice(index.value + 1, 0, track)
    queue.value = updated
    rememberOriginal(track.id)
    return 'queued'
  }

  /**
   * "Add to queue": appends `track` at the end of the queue (at a random
   * place among the upcoming tracks when `shuffled`). A track already coming
   * up stays where it is; one already played is moved.
   */
  function append(track: QueueItem, shuffled: boolean): 'current' | 'already-queued' | 'queued' {
    // Where the track already is in the queue (-1: not there).
    const i = queue.value.findIndex(t => t.id === track.id)
    if (i === index.value) return 'current'
    if (i > index.value) return 'already-queued'
    detach(track.id)
    if (shuffled) {
      // A copy, so watchers see a new array.
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
  function move(from: number, to: number): void {
    // The queue's last position.
    const last = queue.value.length - 1
    if (from === to || from <= index.value || to <= index.value || from > last || to > last) return
    queue.value = moveItem(queue.value, from, to)
  }

  /** Removes the upcoming track at `position` (the current one cannot be removed this way). */
  function removeAt(position: number): void {
    if (position <= index.value || position >= queue.value.length) return
    queue.value = queue.value.filter((_, j) => j !== position)
  }

  /** Drops every upcoming track: playback stops after the current one. */
  function clearUpcoming(): void {
    if (index.value < 0) return
    queue.value = queue.value.slice(0, index.value + 1)
  }

  // --- Library changes -----------------------------------------------------------------

  /** Refreshes a queued track after an edit in the editor (title, cover…). */
  function refresh(detail: TrackDetail): void {
    // Where the edited track is in the queue (-1: not queued).
    const i = queue.value.findIndex(t => t.id === detail.id)
    if (i === -1) return
    // Merge the new summary fields into the queued item, on a copy.
    const updated = [...queue.value]
    updated[i] = { ...updated[i]!, ...pickSummary(detail) }
    queue.value = updated
  }

  /**
   * Removes a deleted track wherever it is, keeping `index` on the current
   * track. (A deleted track that is playing closes the player: the store
   * handles that case before calling this.)
   */
  function drop(id: string): void {
    // Where the track is in the queue (-1: not there).
    const i = queue.value.findIndex(t => t.id === id)
    if (i === -1) return
    queue.value = queue.value.filter(t => t.id !== id)
    if (i < index.value) index.value--
  }

  return {
    queue, index, originalOrder, upcoming,
    startList, replace, newRound, clear,
    shuffleOn, shuffleOff, forgetOriginalOrder,
    insertNext, append, move, removeAt, clearUpcoming,
    refresh, drop,
  }
}

/** The TrackSummary part of a TrackDetail (to refresh a queue item after an edit). */
function pickSummary(detail: TrackDetail): TrackSummary {
  const {
    description: _d, sunoPrompt: _s, lyrics: _l, lyricsSynced: _ls, peaks: _p,
    mimeType: _m, sizeBytes: _sb, audioPath: _a, coverPath: _c, ...summary
  } = detail
  return summary
}
