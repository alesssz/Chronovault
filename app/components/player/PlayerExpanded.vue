<script setup lang="ts">
/**
 * Full-screen player: cover, waveform, controls and synced lyrics.
 * It is just a different view of the same store: opening or closing it
 * never interrupts playback.
 */
const player = usePlayerStore()
const { genreName } = useGenres()

/** The modal is bound to the store, so any component can open or close the view. */
const open = computed({
  get: () => player.expanded,
  set: value => player.setExpanded(value),
})

// Slightly smaller base scale while the full-screen view is open (see main.css).
useHead({ htmlAttrs: { class: computed(() => (open.value ? 'player-expanded' : '')) } })

/** While loading there is no detail yet: show the summary from the queue. */
const track = computed(() => player.current ?? player.queue[player.index] ?? null)
/** "Album · Year · Genre" line (only the parts that are set). */
const meta = computed(() => {
  const t = player.current
  if (!t) return ''
  return [t.album, t.year, genreName(t.genreId)].filter(Boolean).join(' · ')
})
</script>

<template>
  <UModal
    v-model:open="open"
    fullscreen
    title="Player"
    description="Now playing"
    :ui="{ content: 'bg-default' }"
  >
    <template #content>
      <div
        class="flex h-full flex-col"
        data-testid="player-expanded"
      >
        <!-- Top bar: collapse, title, Up next and edit buttons -->
        <header class="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-2">
          <UButton
            icon="i-lucide-chevron-down"
            color="neutral"
            variant="ghost"
            aria-label="Collapse player"
            @click="open = false"
          />
          <span class="text-xs font-medium uppercase tracking-widest text-muted">Now playing</span>
          <div class="flex items-center">
            <!-- The queue panel opens on top of this view (also the way to reach it on phones). -->
            <UButton
              v-if="player.queueEditable"
              icon="i-lucide-list-music"
              color="neutral"
              variant="ghost"
              aria-label="Up next"
              @click="player.setQueueOpen(true)"
            />
            <UButton
              v-if="player.current"
              :to="`/tracks/${player.current.id}/edit`"
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              aria-label="Edit track"
              @click="open = false"
            />
          </div>
        </header>

        <div class="grid min-h-0 flex-1 gap-6 overflow-y-auto px-4 pb-6 md:grid-cols-2 md:gap-10 md:overflow-hidden md:px-10">
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

            <div>
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

            <div class="flex items-center justify-between">
              <PlayerVolume />
              <PlayerControls size="xl" />
            </div>
          </section>

          <!-- Right column: lyrics -->
          <section class="min-h-[50vh] md:min-h-0">
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
