<script setup lang="ts">
import type { SyncedLyricLine, TrackSummary } from '~~/shared/types/track'
import {
  buildSyncedLines,
  formatLrcTimestamp,
  parseLrc,
  roundToCentiseconds,
  serializeLrc,
  syncRowsFromLines,
  syncRowsFromLyrics,
  type SyncRow,
} from '~~/shared/utils/lyrics'
import { lrcFileName } from '~/lib/tags/track-tags'
import { saveFile } from '~/lib/save-file'

/**
 * Manual "tap to sync": while the track plays, press Space (or ↓) at the
 * start of each line to stamp it with the current time.
 *   ↑ undo the last line · R replay the selected line · ←/→ nudge it by 0.05 s
 *   P play/pause · click a line to select it and jump there
 * Playback can be slowed down (pitch preserved), and the detailed waveform
 * shows a draggable marker per synced line.
 * Section headers ([Intro], [Verse 1]…) are kept: they take the time of the
 * line right after them, so they never need stamping.
 */
const props = defineProps<{
  track: TrackSummary
  /** Plain lyrics the rows are taken from. */
  lyrics: string | null
  /** true while the editor is visible: enables keyboard shortcuts. */
  active: boolean
}>()

/** The synced lines being edited (the form's `lyricsSynced`); null when nothing is synced. */
const model = defineModel<SyncedLyricLine[] | null>({ required: true })

// Times come from the player position; the editor also seeks and changes speed.
const player = usePlayerStore()
// LRC import errors, copy confirmations.
const toast = useToast()

/** Speeds offered while syncing (pitch is preserved). */
const SPEEDS = [0.5, 0.75, 1] as const
/** Seconds played before a line's start when replaying it. */
const REPLAY_PREROLL = 1
/** Step of the ←/→ fine adjustment, in seconds. */
const NUDGE_STEP = 0.05

/**
 * Editor rows: lyric lines (with a time once stamped) and section headers.
 * The source of truth while editing; `model` is derived from it.
 */
const rows = ref<SyncRow[]>(initialRows())

/** Existing synced lines when there are some, otherwise the plain lyrics (nothing synced yet). */
function initialRows(): SyncRow[] {
  return model.value?.length ? syncRowsFromLines(model.value) : syncRowsFromLyrics(props.lyrics)
}

/** Rebuilds the rows from the lyrics, keeping the times of lines already synced. */
function reloadFromLyrics() {
  const available = rows.value.filter(r => !r.section && r.time != null)
  rows.value = syncRowsFromLyrics(props.lyrics).map((row) => {
    if (row.section) return row
    const i = available.findIndex(r => r.text === row.text)
    if (i === -1) return row
    const [match] = available.splice(i, 1)
    return { ...row, time: match!.time }
  })
}

// Every change to the rows updates the form model (saved with the track).
watch(rows, (value) => {
  const lines = buildSyncedLines(value)
  model.value = lines.length ? lines : null
}, { deep: true })

/** Syncing needs this track in the player: times come from its position. */
const isLoaded = computed(() => player.current?.id === props.track.id)
/** Rows that need a time (section headers never do). */
const lyricRows = computed(() => rows.value.filter(r => !r.section))
/** "N / M lines synced" counter. */
const syncedCount = computed(() => lyricRows.value.filter(r => r.time != null).length)
/** Next lyric line to sync (section headers are skipped). */
const cursor = computed(() => {
  const i = rows.value.findIndex(r => !r.section && r.time == null)
  return i === -1 ? rows.value.length : i
})
/** Lyric line currently playing (last one with time ≤ current position). */
const playingIndex = computed(() => {
  if (!isLoaded.value) return -1
  // Last stamped lyric line whose time has passed.
  let found = -1
  rows.value.forEach((r, i) => {
    if (!r.section && r.time != null && r.time <= player.currentTime) found = i
  })
  return found
})

/** Row selected for replay and fine adjustment (the last stamped one by default). */
const selected = ref<number | null>(null)

/** Gives the next unsynced line the current playback time (Space / ↓). */
function stamp() {
  if (!isLoaded.value || cursor.value >= rows.value.length) return
  const index = cursor.value
  rows.value[index]!.time = roundToCentiseconds(player.currentTime)
  selected.value = index
}

/** Selects a lyric row; when it is synced, playback jumps to it. */
function select(i: number) {
  if (rows.value[i]?.section) return
  selected.value = i
  seekTo(i)
}

/** Plays the selected line (or the one playing) again from just before its start. */
function replay() {
  const index = selected.value ?? (playingIndex.value >= 0 ? playingIndex.value : null)
  const time = index == null ? null : rows.value[index]?.time
  if (!isLoaded.value || time == null) return
  player.seek(Math.max(0, time - REPLAY_PREROLL))
  if (!player.isPlaying) void player.play()
}

/** Moves the start of a line (after dragging its marker on the waveform). */
function moveLine(i: number, time: number) {
  const row = rows.value[i]
  if (!row || row.section) return
  row.time = Math.max(0, time)
  selected.value = i
}

/** Clears the last synced line and jumps back to just before the previous one (↑). */
function undo() {
  const last = syncedBefore(cursor.value)
  if (last < 0) return
  rows.value[last]!.time = null
  if (selected.value === last) selected.value = null
  // The synced line before the undone one: playback goes back to just before it.
  const previous = syncedBefore(last)
  if (isLoaded.value) player.seek(Math.max(0, (rows.value[previous]?.time ?? 0) - 1))
}

/** Index of the last synced lyric line before row `index` (section headers skipped), -1 when none. */
function syncedBefore(index: number): number {
  let i = index - 1
  while (i >= 0 && (rows.value[i]!.section || rows.value[i]!.time == null)) i--
  return i
}

/** Shifts a line's start by `delta` seconds (←/→), never below 0. */
function nudge(i: number, delta: number) {
  const row = rows.value[i]
  if (row?.time == null) return
  row.time = Math.max(0, roundToCentiseconds(row.time + delta))
}

/** Moves playback to a synced line's start. */
function seekTo(i: number) {
  const time = rows.value[i]?.time
  if (isLoaded.value && time != null) player.seek(time)
}

/** Clears every time and goes back to the start of the track. */
function resetAll() {
  rows.value = rows.value.map(r => ({ ...r, time: null }))
  selected.value = null
  if (isLoaded.value) player.seek(0)
}

// The slower speed is a syncing aid: normal speed again when leaving the editor.
watch(() => props.active, (active) => {
  if (!active) player.setPlaybackRate(1)
})
onBeforeUnmount(() => player.setPlaybackRate(1))

/** Loads (and starts) this track in the player, from the "Start the track to sync" notice. */
function loadInPlayer() {
  void player.playTrack(props.track)
}

// --- Keyboard shortcuts ----------------------------------------------------------
useEventListener('keydown', (event: KeyboardEvent) => {
  if (!props.active || !isLoaded.value) return
  const target = event.target as HTMLElement | null
  // Never steal keys from text fields, sliders (the waveform) or open dialogs (LRC import).
  if (target?.closest('input, textarea, select, [contenteditable="true"], [role="slider"], [role="dialog"]')) return

  if (event.key === 'ArrowDown' || (event.key === ' ' && !target?.closest('button, a'))) {
    event.preventDefault()
    stamp()
  }
  else if (event.key === 'ArrowUp') {
    event.preventDefault()
    undo()
  }
  else if (event.key === 'r' || event.key === 'R') {
    event.preventDefault()
    replay()
  }
  else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && selected.value != null) {
    event.preventDefault()
    nudge(selected.value, event.key === 'ArrowLeft' ? -NUDGE_STEP : NUDGE_STEP)
  }
  else if (event.key === 'p' || event.key === 'P') {
    event.preventDefault()
    void player.togglePlay()
  }
})

// Keep the line to sync always in view.
const rowRefs = ref<HTMLElement[]>([])
// The next line to stamp scrolls into view by itself.
watch(cursor, (i) => {
  rowRefs.value[Math.min(i, rowRefs.value.length - 1)]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
})

// --- LRC import / export ---------------------------------------------------------
const lrcOpen = ref(false)
/** Text of the LRC dialog (export prefill, or what the user pastes). */
const lrcText = ref('')

/** Opens the LRC dialog, prefilled with the current sync (export). */
function openLrc() {
  lrcText.value = model.value?.length ? serializeLrc(model.value) : ''
  lrcOpen.value = true
}

/** Copies the dialog's LRC text to the clipboard (export, e.g. to paste it into another ChronoPlayer). */
async function copyLrc() {
  if (await copyText(lrcText.value)) {
    toast.add({ title: 'LRC copied', icon: 'i-lucide-copy', color: 'success' })
  }
  else {
    // Clipboard refused (permissions): the text is still there to select by hand.
    toast.add({ title: 'Could not copy', description: 'Select the text and copy it by hand', color: 'warning' })
  }
}

/** Saves the dialog's LRC text as "Composers - Title.lrc" (export). */
function downloadLrc() {
  saveFile(new Blob([lrcText.value], { type: 'text/plain;charset=utf-8' }), lrcFileName(props.track))
}

/** Hidden file input behind "Open file". */
const lrcFileInput = ref<HTMLInputElement | null>(null)

/**
 * Loads a chosen .lrc file into the dialog (import). It is not applied yet:
 * the user sees it and confirms with Apply, like pasted text.
 */
async function openLrcFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Cleared so choosing the same file again fires `change` again.
  input.value = ''
  if (!file) return
  lrcText.value = await file.text()
}

/** Replaces the rows with the pasted LRC (import); invalid text leaves everything unchanged. */
function applyLrc() {
  const parsed = parseLrc(lrcText.value)
  if (!parsed.length && lrcText.value.trim()) {
    toast.add({ title: 'No valid lines', description: 'Use the [mm:ss.xx] text format', color: 'error' })
    return
  }
  rows.value = syncRowsFromLines(parsed)
  selected.value = null
  lrcOpen.value = false
}
</script>

<template>
  <div class="space-y-4">
    <!-- The track must be in the player to sync it -->
    <UAlert
      v-if="!isLoaded"
      icon="i-lucide-headphones"
      color="neutral"
      variant="subtle"
      title="Start the track to sync"
      description="Lyrics are synced while you listen: press Space at the start of each line. Section headers like [Verse 1] follow their first line automatically."
      :actions="[{ label: 'Load in player', icon: 'i-lucide-play', onClick: loadInPlayer }]"
    />

    <div
      v-else
      class="space-y-3 rounded-lg border border-default p-2"
    >
      <!-- Sync controls: play/pause, back 5 s, stamp line, undo, replay line, playback speed -->
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          :icon="player.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
          color="neutral"
          variant="subtle"
          :aria-label="player.isPlaying ? 'Pause' : 'Play'"
          @click="player.togglePlay()"
        />
        <UButton
          icon="i-lucide-rotate-ccw"
          color="neutral"
          variant="ghost"
          aria-label="Back 5 seconds"
          @click="player.seek(player.currentTime - 5)"
        />
        <span class="w-20 text-center font-mono text-sm tabular-nums">{{ formatLrcTimestamp(player.currentTime) }}</span>
        <UButton
          icon="i-lucide-corner-down-left"
          label="Stamp line"
          :disabled="cursor >= rows.length"
          data-testid="sync-stamp"
          @click="stamp"
        />
        <UButton
          icon="i-lucide-undo-2"
          label="Undo"
          color="neutral"
          variant="ghost"
          :disabled="syncedCount === 0"
          @click="undo"
        />
        <UButton
          icon="i-lucide-repeat"
          label="Replay line"
          color="neutral"
          variant="ghost"
          :disabled="selected == null && playingIndex < 0"
          data-testid="sync-replay"
          @click="replay"
        />
        <div
          class="ms-auto flex items-center gap-1"
          role="group"
          aria-label="Playback speed"
        >
          <span class="me-1 text-sm text-muted">Speed</span>
          <UButton
            v-for="speed in SPEEDS"
            :key="speed"
            :label="`${speed}×`"
            size="sm"
            :color="player.playbackRate === speed ? 'primary' : 'neutral'"
            :variant="player.playbackRate === speed ? 'solid' : 'ghost'"
            :aria-pressed="player.playbackRate === speed"
            :data-testid="`sync-speed-${speed}`"
            @click="player.setPlaybackRate(speed)"
          />
        </div>
      </div>

      <!-- Detailed waveform with one draggable marker per synced line -->
      <LyricsSyncTimeline
        :key="track.id"
        :rows="rows"
        :selected="selected"
        @move="moveLine"
        @select="select"
      />

      <div class="hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted lg:flex">
        <span><UKbd value="Space" /> stamp</span>
        <span><UKbd value="↑" /> undo</span>
        <span><UKbd value="R" /> replay line</span>
        <span><UKbd value="←" /> <UKbd value="→" /> adjust selected line ±0.05 s</span>
        <span><UKbd value="P" /> play / pause</span>
      </div>
    </div>

    <!-- Progress counter, then Reload from lyrics, LRC import/export and Reset -->
    <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span class="text-muted">{{ syncedCount }} / {{ lyricRows.length }} lines synced</span>
      <div class="flex gap-1">
        <UButton
          label="Reload from lyrics"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="!lyrics"
          @click="reloadFromLyrics"
        />
        <UButton
          label="LRC"
          icon="i-lucide-file-code"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="openLrc"
        />
        <UButton
          label="Reset"
          icon="i-lucide-eraser"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="syncedCount === 0"
          @click="resetAll"
        />
      </div>
    </div>

    <!-- No lyrics yet: write them in the Lyrics tab first -->
    <UEmpty
      v-if="!rows.length"
      icon="i-lucide-text"
      title="No lines to sync"
      description="Write the lyrics in the «Lyrics» tab first, then press «Reload from lyrics», or import an LRC file."
    />

    <!-- The rows: time (click to seek), text (click to select), ±0.1 s and clear buttons; the next line to stamp is highlighted -->
    <ol
      v-else
      class="max-h-[32rem] divide-y divide-default overflow-y-auto rounded-lg border border-default"
      data-testid="sync-rows"
    >
      <li
        v-for="(row, i) in rows"
        :key="i"
        ref="rowRefs"
        class="flex items-center gap-2 px-2 py-1.5"
        :class="row.section
          ? 'bg-elevated/50 pt-3'
          : {
            'bg-primary/10': i === cursor,
            'text-primary': i === playingIndex,
            'ring-1 ring-inset ring-primary': i === selected,
          }"
      >
        <template v-if="row.section">
          <span class="w-20 shrink-0" />
          <span
            class="text-sm font-semibold uppercase tracking-wide text-primary"
            data-testid="sync-section"
          >{{ row.text.slice(1, -1) }}</span>
        </template>
        <template v-else>
          <button
            type="button"
            class="w-20 shrink-0 cursor-pointer rounded px-1 font-mono text-xs tabular-nums hover:bg-elevated disabled:cursor-default"
            :class="row.time == null ? 'text-dimmed' : 'text-muted'"
            :disabled="row.time == null || !isLoaded"
            :aria-label="row.time == null ? 'Not synced' : `Seek to ${formatLrcTimestamp(row.time)}`"
            @click="seekTo(i)"
          >
            {{ row.time == null ? '--:--.--' : formatLrcTimestamp(row.time) }}
          </button>
          <button
            type="button"
            class="min-w-0 flex-1 cursor-pointer truncate text-left"
            :aria-pressed="i === selected"
            data-testid="sync-row-text"
            @click="select(i)"
          >
            {{ row.text || '♪' }}
          </button>
          <template v-if="row.time != null">
            <UButton
              icon="i-lucide-minus"
              color="neutral"
              variant="ghost"
              size="xs"
              aria-label="0.1 seconds earlier"
              @click="nudge(i, -0.1)"
            />
            <UButton
              icon="i-lucide-plus"
              color="neutral"
              variant="ghost"
              size="xs"
              aria-label="0.1 seconds later"
              @click="nudge(i, 0.1)"
            />
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              aria-label="Clear time"
              @click="row.time = null"
            />
          </template>
        </template>
      </li>
    </ol>

    <!-- LRC import / export dialog -->
    <UModal
      v-model:open="lrcOpen"
      title="LRC lyrics"
      description="Import: paste LRC text or open an .lrc file, then Apply. Export: copy or download the text below. Section headers such as [Verse 1] are kept."
    >
      <template #body>
        <UTextarea
          v-model="lrcText"
          :rows="14"
          autoresize
          :maxrows="20"
          class="w-full font-mono"
          placeholder="[00:10.00] [Verse 1]&#10;[00:12.34] First line"
        />
      </template>
      <template #footer>
        <div class="flex w-full flex-wrap items-center justify-between gap-2">
          <!-- Import from a file · export by copy or download -->
          <div class="flex flex-wrap gap-1">
            <UButton
              label="Open file"
              icon="i-lucide-folder-open"
              color="neutral"
              variant="ghost"
              size="sm"
              data-testid="lrc-open"
              @click="lrcFileInput?.click()"
            />
            <input
              ref="lrcFileInput"
              type="file"
              accept=".lrc,.txt,text/plain"
              class="hidden"
              data-testid="lrc-file-input"
              @change="openLrcFile"
            >
            <UButton
              label="Copy"
              icon="i-lucide-copy"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="!lrcText.trim()"
              data-testid="lrc-copy"
              @click="copyLrc"
            />
            <UButton
              label="Download .lrc"
              icon="i-lucide-download"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="!lrcText.trim()"
              data-testid="lrc-download"
              @click="downloadLrc"
            />
          </div>
          <!-- Close, or replace the sync with the text above (kept on the right when the footer wraps) -->
          <div class="ml-auto flex gap-2">
            <UButton
              label="Cancel"
              color="neutral"
              variant="ghost"
              @click="lrcOpen = false"
            />
            <UButton
              label="Apply"
              @click="applyLrc"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
