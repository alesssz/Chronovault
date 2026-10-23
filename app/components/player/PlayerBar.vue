<script setup lang="ts">
/**
 * Bottom player bar, always visible while something is loaded (rendered by
 * the default layout, so it survives page changes).
 *
 * Responsive:
 * - phones: cover, title and play/next, plus a thin progress line on top;
 * - from `md`, three columns: cover and title on the left; in the middle,
 *   on two rows, the transport controls (shuffle, stop, previous, play,
 *   next, repeat) above the times and the waveform; on the right Up next,
 *   expand and close, with the volume from `lg`.
 *
 * The side columns share the room left over by the middle one at a 1:2
 * ratio (`flex-1` / `flex-[2]`, all from a zero basis), so the waveform
 * keeps a real width at every size instead of being the only thing that
 * shrinks; the title truncates first. Tapping the title area opens the
 * full-screen view.
 */
const player = usePlayerStore()

/** What the bar shows (the queued summary while the full data loads). */
const track = computed(() => player.displayTrack)
</script>

<template>
  <div
    class="fixed inset-x-0 bottom-0 z-40 border-t border-default bg-default/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    data-testid="player-bar"
  >
    <!-- On mobile there is no waveform: a thin progress bar instead. -->
    <div class="h-0.5 bg-accented md:hidden">
      <div
        class="h-full bg-primary"
        :style="{ width: `${player.progress * 100}%` }"
      />
    </div>

    <UContainer class="flex h-(--player-bar-height) items-center gap-3 md:gap-5">
      <!-- Left column: cover and title (opens the full-screen view) -->
      <button
        type="button"
        class="flex min-w-0 flex-1 basis-0 cursor-pointer items-center gap-3 text-left"
        aria-label="Open player"
        @click="player.setExpanded(true)"
      >
        <TrackCover
          :url="track?.coverUrl"
          :title="track?.title"
          class="size-12"
        />
        <div class="min-w-0">
          <p
            class="truncate font-medium"
            data-testid="player-title"
          >
            {{ track?.title }}
          </p>
          <p
            v-if="player.status === 'error'"
            class="truncate text-sm text-error"
          >
            {{ player.error }}
          </p>
          <p
            v-else
            class="truncate text-sm text-muted"
          >
            {{ track?.composers || '—' }}
          </p>
        </div>
      </button>

      <!-- Phones: play/pause and next only -->
      <PlayerControls
        :show-stop="false"
        :show-modes="false"
        class="md:hidden"
      />

      <!-- Middle column (md+): the controls on top, the times and the waveform under them -->
      <div class="hidden min-w-0 flex-[2] basis-0 flex-col items-center gap-1 md:flex">
        <PlayerControls />
        <div class="flex w-full min-w-0 items-center gap-3">
          <span
            class="w-12 shrink-0 text-right text-xs tabular-nums text-muted"
            data-testid="player-elapsed"
          >
            {{ formatTime(player.currentTime) }}
          </span>
          <div
            class="min-w-0 flex-1"
            data-testid="player-waveform"
          >
            <!-- Keyed by track: a new waveform is built for every track. -->
            <PlayerWaveform
              v-if="player.current"
              :key="player.current.id"
              :peaks="player.current.peaks"
              :duration="player.duration"
              :height="32"
            />
            <USkeleton
              v-else
              class="h-8 w-full"
            />
          </div>
          <span class="w-12 shrink-0 text-xs tabular-nums text-muted">
            {{ formatRemaining(player.currentTime, player.duration) }}
          </span>
          <!-- Speed badge: reminds that playback is slowed (e.g. by the sync editor). -->
          <UBadge
            v-if="player.playbackRate !== 1"
            :label="`${player.playbackRate}×`"
            color="primary"
            variant="subtle"
            size="sm"
            data-testid="player-rate"
          />
        </div>
      </div>

      <!-- Right column (md+): volume from lg, then Up next, expand and close -->
      <div class="hidden flex-1 basis-0 items-center justify-end gap-3 md:flex">
        <PlayerVolume class="hidden lg:flex" />
        <div class="flex shrink-0 items-center">
          <IconButton
            v-if="player.queueEditable"
            icon="i-lucide-list-music"
            color="neutral"
            variant="ghost"
            label="Up next"
            data-testid="player-queue"
            @click="player.setQueueOpen(true)"
          />
          <IconButton
            icon="i-lucide-maximize-2"
            color="neutral"
            variant="ghost"
            label="Expand player"
            data-testid="player-expand"
            @click="player.setExpanded(true)"
          />
          <IconButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            label="Close player"
            @click="player.close()"
          />
        </div>
      </div>
    </UContainer>
  </div>
</template>
