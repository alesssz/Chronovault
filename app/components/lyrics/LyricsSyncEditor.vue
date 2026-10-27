<script setup lang="ts">
import type { SyncedLyricLine, TrackSummary } from '~~/shared/types/track'
import { buildSyncedLines, formatLrcTimestamp, syncRowsFromLines, syncRowsFromLyrics } from '~~/shared/utils/lyrics'
import { createLyricsSync } from '~/lib/lyrics-sync'

/**
 * Manual "tap to sync": while the track plays, press Space (or ↓) at the
 * start of each line to stamp it with the current time.
 *   ↑ undo the last line · R replay the selected line · ←/→ nudge it by 0.05 s
 *   P play/pause · click a line to select it and jump there
 * While the editor is in use it claims the keyboard (useKeyboardClaim): the
 * player's own shortcuts (Space play/pause, ← / → seek…) wait, so Space
 * stamps a line instead of pausing.
 * Playback can be slowed down (pitch preserved), and the detailed waveform
 * shows a draggable marker per synced line.
 * Section headers ([Intro], [Verse 1]…) are kept: they take the time of the
 * line right after them, so they never need stamping.
 *
 * What each action does to the rows (stamp, undo, replay, nudge…) lives in
 * lib/lyrics-sync.ts; this component is the screen around it: buttons, keys,
 * the rows, and the LRC import / export dialog (LyricsLrcDialog). The playback
 * time it shows is LyricsSyncClock, so that the editor does not render again
 * on every frame; the detailed waveform waits for the editor to be shown.
 *
 * Phones have no keyboard and little height: there, Stamp line and Undo
 * leave the controls row for a bar pinned to the bottom of the screen, just
 * above the player bar, so they stay under the thumb while the lines
 * scroll by; the lines scroll with the page instead of inside a box of
 * their own (a scroll area nested in the page is awkward with a finger).
 * The keyboard legend shows only where there is a mouse or trackpad.
 *
 * Syncing is done by ear, often without touching the phone for a while, so:
 * - the screen stays on while the editor is open with its track loaded
 *   (Screen Wake Lock), instead of dimming and locking mid-song;
 * - stamping a line gives a short vibration, undoing two (Android only;
 *   see lib/haptics), so each tap is felt without looking.
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

/** Speeds offered while syncing (pitch is preserved). */
const SPEEDS = [0.5, 0.75, 1] as const
/** Step of the ←/→ fine adjustment, in seconds. */
const NUDGE_STEP = 0.05

/** Syncing needs this track in the player: times come from its position. */
const isLoaded = computed(() => player.current?.id === props.track.id)

/**
 * The detailed waveform is built from the first time the editor is shown, then
 * kept. It downloads and decodes the whole audio file (tens of MB), and the edit
 * page mounts this editor hidden with its Sync tab: without this, opening the
 * page of the track playing paid for it even when Sync was never opened. Kept
 * afterwards, so going back and forth between tabs decodes the file only once.
 */
const timelineShown = ref(props.active)
// The first time the editor is shown, the waveform is built (and stays from then on).
watch(() => props.active, (active) => {
  if (active) timelineShown.value = true
})

/**
 * The rows and their actions, starting from the existing synced lines when
 * there are some, otherwise from the plain lyrics (nothing synced yet).
 */
const {
  rows, selected, lyricRows, syncedCount, cursor, playingIndex,
  stamp, select, replay, moveLine, undo, nudge, seekTo, resetAll, reloadFromLyrics, replaceWith,
} = createLyricsSync(
  model.value?.length ? syncRowsFromLines(model.value) : syncRowsFromLyrics(props.lyrics),
  {
    get loaded() { return isLoaded.value },
    get currentTime() { return player.currentTime },
    get playing() { return player.isPlaying },
    seek: seconds => player.seek(seconds),
    play: () => void player.play(),
  },
)

// Every change to the rows updates the form model (saved with the track).
watch(rows, (value) => {
  // The synced lines, as saved with the track (none: the field is cleared).
  const lines = buildSyncedLines(value)
  model.value = lines.length ? lines : null
}, { deep: true })

// The slower speed is a syncing aid: normal speed again when leaving the editor.
watch(() => props.active, (active) => {
  if (!active) player.setPlaybackRate(1)
})
// Leaving the editor always gives the normal speed back.
onBeforeUnmount(() => player.setPlaybackRate(1))

// --- Screen kept on while syncing ----------------------------------------------------
// Without this the phone dims and locks after its usual timeout, since syncing
// means listening rather than touching. VueUse's useWakeLock asks for it again
// whenever the page comes back to the foreground (the browser drops it when
// hidden) and lets it go when the component goes away.
const wakeLock = useWakeLock()
/** The editor is in use: its tab is shown and the track is in the player. */
const syncing = computed(() => props.active && isLoaded.value)
// The screen stays on while syncing (phones), and may sleep again after.
watch(syncing, (on) => {
  if (!wakeLock.isSupported.value) return
  // Refusals are fine (e.g. battery saver): the screen just behaves as usual.
  if (on) wakeLock.request('screen').catch(() => {})
  else wakeLock.release().catch(() => {})
}, { immediate: true })

/** Loads (and starts) this track in the player, from the "Start the track to sync" notice. */
function loadInPlayer() {
  void player.playTrack(props.track)
}

// --- Keyboard shortcuts ----------------------------------------------------------
// The editor uses the keys as a whole while in use (Space stamps a line, ← / → nudge it,
// P plays): the player's own shortcuts (Space play/pause, ← / → seek…) wait meanwhile.
useKeyboardClaim(syncing)

// The editor's own keys (Space stamps, R replays, arrows nudge…), while it is in use.
useEventListener('keydown', (event: KeyboardEvent) => {
  if (!props.active || !isLoaded.value) return
  // Where the key was pressed: some places keep their keys.
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

/** The LRC import / export dialog (LyricsLrcDialog) is open. */
const lrcOpen = ref(false)
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
      description="Lyrics are synced while you listen: press Space (or tap Stamp line) at the start of each line. Section headers like [Verse 1] follow their first line automatically."
      :actions="[{ label: 'Load in player', icon: 'i-lucide-play', onClick: loadInPlayer }]"
    />

    <div
      v-else
      class="space-y-3 rounded-lg border border-default p-2"
    >
      <!-- Sync controls: play/pause, back 5 s, stamp line, undo, replay line, playback speed (on phones stamp and undo are in the pinned bar below) -->
      <div class="flex flex-wrap items-center gap-2">
        <IconButton
          :icon="player.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
          color="neutral"
          variant="subtle"
          :label="player.isPlaying ? 'Pause' : 'Play'"
          @click="player.togglePlay()"
        />
        <IconButton
          icon="i-lucide-rotate-ccw"
          color="neutral"
          variant="ghost"
          label="Back 5 seconds"
          @click="player.seek(player.currentTime - 5)"
        />
        <LyricsSyncClock />
        <UButton
          icon="i-lucide-corner-down-left"
          label="Stamp line"
          :disabled="cursor >= rows.length"
          class="hidden md:inline-flex"
          data-testid="sync-stamp"
          @click="stamp"
        />
        <UButton
          icon="i-lucide-undo-2"
          label="Undo"
          color="neutral"
          variant="ghost"
          :disabled="syncedCount === 0"
          class="hidden md:inline-flex"
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

      <!-- Detailed waveform with one draggable marker per synced line (from the first time the editor is shown) -->
      <LyricsSyncTimeline
        v-if="timelineShown"
        :key="track.id"
        :rows="rows"
        :selected="selected"
        @move="moveLine"
        @select="select"
      />

      <!-- Keyboard legend: only with a mouse or trackpad (a keyboard is likely there, unlike on a touch screen) -->
      <div class="hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted pointer-fine:flex">
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
          @click="reloadFromLyrics(lyrics)"
        />
        <UButton
          label="LRC"
          icon="i-lucide-file-code"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="lrcOpen = true"
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

    <!--
      The rows: time (click to seek), text (click to select), ±0.1 s and clear buttons; the next line to stamp is highlighted.
      From `md` they scroll inside their own box; on phones with the page, and the scroll margins keep the
      line brought into view clear of the sticky header (top) and of the stamp bar and player bar (bottom).
    -->
    <ol
      v-else
      class="divide-y divide-default rounded-lg border border-default md:max-h-[32rem] md:overflow-y-auto"
      data-testid="sync-rows"
    >
      <li
        v-for="(row, i) in rows"
        :key="i"
        ref="rowRefs"
        class="flex scroll-mt-16 scroll-mb-[calc(var(--player-bar-height)+6rem)] items-center gap-2 px-2 py-1.5 md:scroll-m-0"
        :class="row.section
          ? 'bg-elevated/50 pt-3'
          : {
            'bg-primary/10': i === cursor,
            'text-primary': i === playingIndex,
            'ring-1 ring-inset ring-primary': i === selected,
          }"
      >
        <!-- A section header: a title, never stamped (it follows the line after it) -->
        <template v-if="row.section">
          <span class="w-20 shrink-0" />
          <span
            class="text-sm font-semibold uppercase tracking-wide text-primary"
            data-testid="sync-section"
          >{{ row.text.slice(1, -1) }}</span>
        </template>
        <!-- A lyric line: its time (or a dash until stamped), its text, and its nudges -->
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
            <IconButton
              icon="i-lucide-minus"
              color="neutral"
              variant="ghost"
              size="xs"
              label="0.1 seconds earlier"
              @click="nudge(i, -0.1)"
            />
            <IconButton
              icon="i-lucide-plus"
              color="neutral"
              variant="ghost"
              size="xs"
              label="0.1 seconds later"
              @click="nudge(i, 0.1)"
            />
            <IconButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              label="Clear time"
              @click="row.time = null"
            />
          </template>
        </template>
      </li>
    </ol>

    <!--
      Phones: Undo and Stamp line pinned to the bottom of the screen, just above the player
      bar (its height and the home-indicator area, plus a small gap that also clears its thin
      progress line), for as long as the editor is on screen. Last in the editor, so it rests
      under the lines once the page is scrolled to the end.
    -->
    <div
      v-if="isLoaded"
      class="sticky bottom-[calc(var(--player-bar-height)+env(safe-area-inset-bottom)+0.5rem)] z-10 flex gap-2 rounded-lg border border-default bg-default/95 p-2 shadow-lg backdrop-blur md:hidden"
      data-testid="sync-stamp-bar"
    >
      <UButton
        icon="i-lucide-undo-2"
        label="Undo"
        color="neutral"
        variant="subtle"
        size="xl"
        :disabled="syncedCount === 0"
        @click="undo"
      />
      <UButton
        icon="i-lucide-corner-down-left"
        label="Stamp line"
        size="xl"
        block
        class="flex-1"
        :disabled="cursor >= rows.length"
        data-testid="sync-stamp-mobile"
        @click="stamp"
      />
    </div>

    <!-- LRC import / export dialog: prefilled with the current sync, Apply replaces it -->
    <LyricsLrcDialog
      v-model:open="lrcOpen"
      :track="track"
      :lines="model"
      @apply="replaceWith"
    />
  </div>
</template>
