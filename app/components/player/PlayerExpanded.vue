<script setup lang="ts">
/**
 * Full-screen player: cover, waveform, controls and synced lyrics.
 * It is just a different view of the same store: opening or closing it
 * never interrupts playback.
 *
 * On touch screens it can be pulled down to close (useSwipeToDismiss): the
 * view follows the finger and the dimmed page shows behind it. For that the
 * modal's own panel is transparent and this component's root paints the
 * background, so moving the root moves the whole visible view. Elements that
 * handle dragging themselves (waveform, volume slider, lyrics) are marked
 * `data-swipe-ignore`. The Android back button collapses it too.
 */
const player = usePlayerStore()
const { genreName } = useGenres()

/** The modal is bound to the store, so any component can open or close the view. */
const open = computed({
  get: () => player.expanded,
  set: value => player.setExpanded(value),
})

/** The view's root: the pull-down moves it. */
const view = ref<HTMLElement | null>(null)
/** The view's scrolling area (phones): the pull-down starts only at its top. */
const scroller = ref<HTMLElement | null>(null)

/** Pull down to close, on touch screens. */
const swipe = useSwipeToDismiss(view, {
  scroller,
  onDismiss: () => {
    open.value = false
  },
})
// Every opening starts at rest (a pull-down that closed the view leaves its offset behind).
watch(open, (value) => {
  if (value) swipe.reset()
})

/**
 * Style of the root while pulled: moved down by the finger, with no
 * transition while dragging (it must stick to the finger) and a short one on
 * release (the spring back).
 */
const viewStyle = computed(() => ({
  transform: swipe.offset.value ? `translateY(${swipe.offset.value}px)` : undefined,
  transition: swipe.dragging.value ? 'none' : 'transform 200ms ease-out',
}))

// The Android back button collapses the view instead of leaving the page (see useCloseOnBack).
useCloseOnBack(open, () => {
  open.value = false
})

// Slightly smaller base scale while the full-screen view is open (see main.css).
useHead({ htmlAttrs: { class: computed(() => (open.value ? 'player-expanded' : '')) } })

/** What the view shows (the queued summary while the full data loads). */
const track = computed(() => player.displayTrack)
/** "Album · Year · Genre" line (only the parts that are set). */
const meta = computed(() => {
  const t = player.current
  return t ? joinParts([t.album, t.year, genreName(t.genreId)]) : ''
})
</script>

<template>
  <UModal
    v-model:open="open"
    fullscreen
    title="Player"
    description="Now playing"
    :ui="{ content: 'bg-transparent shadow-none ring-0' }"
  >
    <template #content>
      <!-- The view itself: it paints the background, so the pull-down moves all of it (rounded while pulled) -->
      <div
        ref="view"
        class="flex h-full flex-col bg-default"
        :class="{ 'rounded-t-2xl': swipe.offset.value > 0 }"
        :style="viewStyle"
        data-testid="player-expanded"
      >
        <!-- Top bar: collapse, title, Cast (when a device is around), Up next and edit buttons -->
        <header class="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-2">
          <IconButton
            icon="i-lucide-chevron-down"
            color="neutral"
            variant="ghost"
            label="Collapse player"
            @click="open = false"
          />
          <span class="text-xs font-medium uppercase tracking-widest text-muted">Now playing</span>
          <div class="flex items-center">
            <!-- Cast to a TV or speaker (the phones' way to reach it: their player bar has no room) -->
            <PlayerCastButton />
            <!-- The queue panel opens on top of this view (also the way to reach it on phones). -->
            <IconButton
              v-if="player.queueEditable"
              icon="i-lucide-list-music"
              color="neutral"
              variant="ghost"
              label="Up next"
              @click="player.setQueueOpen(true)"
            />
            <IconButton
              v-if="player.current"
              :to="`/tracks/${player.current.id}/edit`"
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              label="Edit track"
              @click="open = false"
            />
          </div>
        </header>

        <!--
          Scrolling area on phones (the pull-down starts only at its top). `overscroll-y-contain`
          keeps a pull at the top from reaching the browser (pull to refresh) instead of the view.
          `grid-cols-1` matters on phones: without an explicit column, the column grows to the
          width of the longest unbroken text (a long title, which only truncates inside a column
          of fixed width) and the whole view spilled off the right edge.
        -->
        <div
          ref="scroller"
          class="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto overscroll-y-contain px-4 pb-6 md:grid-cols-2 md:gap-10 md:overflow-hidden md:px-10"
        >
          <!--
            Left column: cover, info, waveform, controls. On desktop its width
            (and so the square cover) follows the window height, so the controls
            always stay on screen; 23rem is the height of everything but the cover.
          -->
          <section class="mx-auto flex w-full max-w-md flex-col justify-center gap-5 md:max-w-[max(20rem,min(32rem,calc(100dvh-23rem)))]">
            <TrackCover
              :url="track?.coverUrl"
              :title="track?.title"
              rounded="rounded-xl"
              class="w-full shadow-2xl shadow-black/40"
            />

            <div class="min-w-0">
              <h2 class="truncate text-2xl font-bold tracking-tight">
                {{ track?.title }}
              </h2>
              <p class="truncate text-muted">
                {{ track?.composers || '—' }}
              </p>
              <p
                v-if="meta"
                class="truncate text-sm text-dimmed"
              >
                {{ meta }}
              </p>
            </div>

            <!-- The waveform seeks by dragging: never a pull-down -->
            <div data-swipe-ignore>
              <PlayerWaveform
                v-if="player.current && open"
                :key="player.current.id"
                :peaks="player.current.peaks"
                :duration="player.duration"
                :height="64"
              />
              <div class="mt-1 flex justify-between text-xs tabular-nums text-muted">
                <span>{{ formatTime(player.currentTime) }}</span>
                <span>{{ formatRemaining(player.currentTime, player.duration) }}</span>
              </div>
            </div>

            <p
              v-if="player.status === 'error'"
              class="text-sm text-error"
            >
              {{ player.error }}
            </p>

            <!-- Controls on their own row (six buttons fill this column), the volume under them -->
            <div class="flex flex-col items-center gap-3">
              <PlayerControls size="xl" />
              <PlayerVolume data-swipe-ignore />
            </div>
          </section>

          <!-- Right column: lyrics (they scroll on their own: never a pull-down) -->
          <section
            class="min-h-[50vh] md:min-h-0"
            data-swipe-ignore
          >
            <LyricsView
              :synced="player.current?.lyricsSynced ?? null"
              :plain="player.current?.lyrics ?? null"
              :current-time="player.currentTime"
              @seek="player.seek"
            />
          </section>
        </div>
      </div>
    </template>
  </UModal>
</template>
