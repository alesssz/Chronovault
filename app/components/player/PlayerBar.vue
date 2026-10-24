<script setup lang="ts">
/**
 * Bottom player bar, always visible while something is loaded (rendered by
 * the default layout, so it survives page changes).
 *
 * Responsive:
 * - phones: cover, title and play/next, plus a thin progress line on top;
 * - from `md`, three columns: cover and title on the left; in the middle,
 *   on two rows, the times and the waveform above the transport controls
 *   (shuffle, stop, previous, play, next, repeat), the same order as the
 *   full-screen view, and like the phones' progress line on top; on the
 *   right the volume, Cast (always on touch screens, otherwise only when a
 *   TV or speaker can be offered, see PlayerCastButton), Up next, expand and
 *   close. From `md` the bar is also
 *   taller (`--player-bar-height`, see main.css), so the two rows have room
 *   around them;
 * - tablets (`md` to `lg`): the volume is a single speaker button opening a
 *   small popover with the slider (no room for an inline one); from `lg`
 *   the slider sits inline. The Expand button is left out there too: Cast
 *   is always shown on touch screens, and a fifth icon squeezed the title
 *   to a few letters again, while the title area (tap, or swipe up) already
 *   opens the full-screen view. From `lg` there is room for both.
 *
 * From `lg` the side columns share the room left over by the middle one at
 * a 1:2 ratio (`flex-1` / `flex-[2]`, all from a zero basis), so the
 * waveform keeps a real width at every size instead of being the only thing
 * that shrinks, and the middle column stays centred; the title truncates
 * first. On tablets that ratio left the title a few letters wide, so there
 * the right column only takes the width of its buttons (`flex-none`) and
 * the middle one is a bit narrower (`flex-[1.5]`, still wide enough for
 * the six controls): the title gets the difference. Tapping the title area
 * opens the full-screen view.
 *
 * On touch screens the title area also takes swipes (useTrackSwipe): left
 * for the next track, right for the previous one, up for the full-screen
 * view. The cover and title follow the finger sideways and fade a little,
 * so the gesture shows before it commits.
 */
const player = usePlayerStore()

/** The title area (cover and title): tap to open the full-screen view, swipe to change track. */
const trackArea = ref<HTMLElement | null>(null)
/** Swipes on the title area, touch only. */
const swipe = useTrackSwipe(trackArea, {
  canNext: () => player.hasNext,
  onNext: () => void player.next(),
  onPrevious: () => void player.previous(),
  onOpen: () => player.setExpanded(true),
})
/**
 * Cover and title while swiped: moved with the finger and fading the
 * further they go; no transition while dragging (they stick to the finger),
 * a short one on release (back in place).
 */
const swipeStyle = computed(() => ({
  transform: swipe.offset.value ? `translateX(${swipe.offset.value}px)` : undefined,
  opacity: swipe.offset.value ? Math.max(0.3, 1 - Math.abs(swipe.offset.value) / 250) : undefined,
  transition: swipe.dragging.value ? 'none' : 'transform 200ms ease-out, opacity 200ms ease-out',
}))

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

    <UContainer class="flex h-(--player-bar-height) items-center gap-3 md:gap-5 lg:gap-8">
      <!--
        Left column: cover and title (opens the full-screen view). On touch screens it also
        takes swipes, so the browser must leave its touches alone (`touch-none`: no page
        scroll or navigation starting here); the inner row is what moves with the finger.
      -->
      <button
        ref="trackArea"
        type="button"
        class="flex min-w-0 flex-1 basis-0 cursor-pointer touch-none items-center text-left"
        aria-label="Open player"
        data-testid="player-track-area"
        @click="player.setExpanded(true)"
      >
        <div
          class="flex min-w-0 items-center gap-3"
          :style="swipeStyle"
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
        </div>
      </button>

      <!-- Phones: play/pause and next only -->
      <PlayerControls
        :show-stop="false"
        :show-modes="false"
        class="md:hidden"
      />

      <!-- Middle column (md+): the times and the waveform on top, the controls under them -->
      <div class="hidden min-w-0 flex-[1.5] basis-0 flex-col items-center gap-2 md:flex lg:flex-[2]">
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
        <PlayerControls />
      </div>

      <!-- Right column (md+): volume (a popover button on tablets, inline from lg), then Cast (always on touch screens, otherwise when a device is around), Up next, expand (from lg) and close -->
      <div class="hidden flex-none items-center justify-end gap-3 md:flex lg:flex-1 lg:basis-0">
        <PlayerVolume class="hidden lg:flex" />
        <div class="flex shrink-0 items-center">
          <!-- Tablets: the volume joins the icon buttons, as one more of them -->
          <PlayerVolume
            compact
            class="lg:hidden"
          />
          <!-- Cast to a TV or speaker: only rendered when the browser can offer a device -->
          <PlayerCastButton />
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
            class="hidden lg:inline-flex"
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
