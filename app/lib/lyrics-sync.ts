/**
 * The rows of the lyrics sync editor and what can be done to them, without
 * any UI: "tap to sync" (stamp the next line with the playback time), undo,
 * replay a line, nudge or drag a line's start, select a line (jumping to
 * it), reset, rebuild from edited lyrics, or take an imported LRC.
 *
 * Times come from the player, and some actions move it: the editor
 * (components/lyrics/LyricsSyncEditor.vue) passes a SyncPlayback over the
 * player store, the tests a fake one. Keys, buttons, the screen wake lock
 * and the LRC dialog stay in the editor.
 *
 * Section headers ([Verse 1]…) are rows too but never get a time: they take
 * the time of the line after them when the lines are built (buildSyncedLines).
 */
import { computed, ref } from 'vue'
import type { SyncedLyricLine } from '~~/shared/types/track'
import { roundToCentiseconds, syncRowsFromLines, syncRowsFromLyrics, type SyncRow } from '~~/shared/utils/lyrics'
import { HAPTIC, haptic } from '~/lib/haptics'

/** Seconds played before a line's start when replaying it. */
export const REPLAY_PREROLL = 1

/** What the sync needs from the player (the player store, in the app). */
export interface SyncPlayback {
  /** The track being synced is the one in the player: only then is its position the track's time. */
  readonly loaded: boolean
  /** Playback position, in seconds. */
  readonly currentTime: number
  /** Playing, not paused. */
  readonly playing: boolean
  /** Moves playback to `seconds`. */
  seek(seconds: number): void
  /** Starts or resumes playback. */
  play(): void
}

/** Reactive sync rows, starting from `initial`; one per editor (see the file comment). */
export function createLyricsSync(initial: SyncRow[], playback: SyncPlayback) {
  /**
   * Editor rows: lyric lines (with a time once stamped) and section headers.
   * The source of truth while editing; the editor derives the saved lines from it.
   */
  const rows = ref<SyncRow[]>(initial)
  /** Row selected for replay and fine adjustment (the last stamped one by default). */
  const selected = ref<number | null>(null)

  /** Rows that need a time (section headers never do). */
  const lyricRows = computed(() => rows.value.filter(r => !r.section))
  /** "N / M lines synced" counter. */
  const syncedCount = computed(() => lyricRows.value.filter(r => r.time != null).length)
  /** Next lyric line to sync (section headers are skipped); `rows.length` once all are synced. */
  const cursor = computed(() => {
    // The first lyric line without a time.
    const i = rows.value.findIndex(r => !r.section && r.time == null)
    return i === -1 ? rows.value.length : i
  })
  /** Lyric line currently playing (last one with time ≤ current position); -1 when none. */
  const playingIndex = computed(() => {
    if (!playback.loaded) return -1
    // Last stamped lyric line whose time has passed.
    let found = -1
    rows.value.forEach((r, i) => {
      if (!r.section && r.time != null && r.time <= playback.currentTime) found = i
    })
    return found
  })

  /** Gives the next unsynced line the current playback time (Space / ↓ / Stamp line). */
  function stamp() {
    if (!playback.loaded || cursor.value >= rows.value.length) return
    // The line being stamped.
    const index = cursor.value
    rows.value[index]!.time = roundToCentiseconds(playback.currentTime)
    selected.value = index
    // Felt in the hand: the tap landed (keyboard stamps too, on a phone with a keyboard).
    haptic(HAPTIC.tick)
  }

  /** Selects a lyric row; when it is synced, playback jumps to it. */
  function select(i: number) {
    if (rows.value[i]?.section) return
    selected.value = i
    seekTo(i)
  }

  /** Plays the selected line (or the one playing) again from just before its start. */
  function replay() {
    // The selected line, or else the one playing (none: nothing to replay).
    const index = selected.value ?? (playingIndex.value >= 0 ? playingIndex.value : null)
    // That line's start, if it has one.
    const time = index == null ? null : rows.value[index]?.time
    if (!playback.loaded || time == null) return
    playback.seek(Math.max(0, time - REPLAY_PREROLL))
    if (!playback.playing) playback.play()
  }

  /** Moves the start of a line (after dragging its marker on the waveform). */
  function moveLine(i: number, time: number) {
    // The dragged line (a section header has no time to move).
    const row = rows.value[i]
    if (!row || row.section) return
    row.time = Math.max(0, time)
    selected.value = i
  }

  /** Clears the last synced line and jumps back to just before the previous one (↑ / Undo). */
  function undo() {
    // The last line stamped, the one to undo.
    const last = syncedBefore(cursor.value)
    if (last < 0) return
    rows.value[last]!.time = null
    if (selected.value === last) selected.value = null
    // A different feel from a stamp: two short ticks.
    haptic(HAPTIC.undo)
    // The synced line before the undone one: playback goes back to just before it.
    const previous = syncedBefore(last)
    if (playback.loaded) playback.seek(Math.max(0, (rows.value[previous]?.time ?? 0) - 1))
  }

  /** Index of the last synced lyric line before row `index` (section headers skipped), -1 when none. */
  function syncedBefore(index: number): number {
    // Walks back from the row before `index`.
    let i = index - 1
    while (i >= 0 && (rows.value[i]!.section || rows.value[i]!.time == null)) i--
    return i
  }

  /** Shifts a line's start by `delta` seconds (←/→, ±0.1 buttons), never below 0. */
  function nudge(i: number, delta: number) {
    // The line to shift (only a synced one has a start).
    const row = rows.value[i]
    if (row?.time == null) return
    row.time = Math.max(0, roundToCentiseconds(row.time + delta))
  }

  /** Moves playback to a synced line's start. */
  function seekTo(i: number) {
    // The line's start (none: nothing to jump to).
    const time = rows.value[i]?.time
    if (playback.loaded && time != null) playback.seek(time)
  }

  /** Clears every time and goes back to the start of the track. */
  function resetAll() {
    rows.value = rows.value.map(r => ({ ...r, time: null }))
    selected.value = null
    if (playback.loaded) playback.seek(0)
  }

  /** Rebuilds the rows from (edited) lyrics, keeping the times of lines already synced. */
  function reloadFromLyrics(lyrics: string | null) {
    // The lines synced so far: their times go to the same lines of the new lyrics.
    const available = rows.value.filter(r => !r.section && r.time != null)
    rows.value = syncRowsFromLyrics(lyrics).map((row) => {
      if (row.section) return row
      // The same text among them (the first one left, for repeated lines such as a chorus).
      const i = available.findIndex(r => r.text === row.text)
      if (i === -1) return row
      // Taken out, so a repeated line gives its time to one new line only.
      const [match] = available.splice(i, 1)
      return { ...row, time: match!.time }
    })
  }

  /** Replaces every row with imported synced lines (an applied LRC). */
  function replaceWith(lines: SyncedLyricLine[]) {
    rows.value = syncRowsFromLines(lines)
    selected.value = null
  }

  return {
    rows, selected, lyricRows, syncedCount, cursor, playingIndex,
    stamp, select, replay, moveLine, undo, nudge, seekTo, resetAll, reloadFromLyrics, replaceWith,
  }
}
