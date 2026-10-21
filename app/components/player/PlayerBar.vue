<script setup lang="ts">
/**
 * Bottom player bar, always visible while something is loaded (rendered by
 * the default layout, so it survives page changes).
 *
 * Responsive: on phones only cover, title and play/next (plus a thin
 * progress line); from `md` the waveform, times, stop and expand/close;
 * from `lg` the volume. Tapping the title area opens the full-screen view.
 */
const player = usePlayerStore()

/** While loading there is no detail yet: show the summary from the queue. */
const track = computed(() => player.current ?? player.queue[player.index] ?? null)
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
      <button
        type="button"
        class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left md:w-60 md:flex-none"
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

      <PlayerControls
        :show-stop="false"
        class="md:hidden"
      />
      <PlayerControls class="hidden md:flex" />

      <div class="hidden min-w-0 flex-1 items-center gap-3 md:flex">
        <span class="w-12 text-right text-xs tabular-nums text-muted">
          {{ formatTime(player.currentTime) }}
        </span>
        <div class="min-w-0 flex-1">
          <!-- Keyed by track: a new waveform is built for every track. -->
          <PlayerWaveform
            v-if="player.current"
            :key="player.current.id"
            :peaks="player.current.peaks"
            :duration="player.duration"
            :height="40"
          />
          <USkeleton
            v-else
            class="h-10 w-full"
          />
        </div>
        <span class="w-12 text-xs tabular-nums text-muted">
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

      <PlayerVolume class="hidden lg:flex" />

      <div class="hidden items-center md:flex">
        <UButton
          v-if="player.queueEditable"
          icon="i-lucide-list-music"
          color="neutral"
          variant="ghost"
          aria-label="Up next"
          data-testid="player-queue"
          @click="player.setQueueOpen(true)"
        />
        <UButton
          icon="i-lucide-maximize-2"
          color="neutral"
          variant="ghost"
          aria-label="Expand player"
          data-testid="player-expand"
          @click="player.setExpanded(true)"
        />
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          aria-label="Close player"
          @click="player.close()"
        />
      </div>
    </UContainer>
  </div>
</template>
