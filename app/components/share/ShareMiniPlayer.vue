<script setup lang="ts">
import { ariaShortcut } from '~/lib/keyboard-shortcuts'
/**
 * Mini player of the share pages (/t/:id, /p/:id): a bar fixed at the bottom
 * of the screen, shown while the page's own player (SharePlayer, which
 * renders this) has scrolled out of view. Mostly for phones, where scrolling
 * a long list or the lyrics would otherwise leave the visitor without a
 * play button.
 *
 * Like the app's player bar on phones (PlayerBar), in little room: a thin
 * progress line on top; cover and title, which open the full-screen view
 * on a tap, or on touch screens take swipes (left: next, right: previous,
 * up: full screen, see useTrackSwipe); then previous / play / next
 * (previous and next for playlists only).
 *
 * The page reserves room at its bottom for it while its player is in use
 * (`has-mini-player` in the public layout), so it never covers the end of
 * the page.
 *
 * Previous, play and next announce their keyboard shortcut to screen
 * readers (aria-keyshortcuts, app/lib/keyboard-shortcuts.ts).
 */
const props = defineProps<{
  /** The page's own player is off screen: the bar shows. */
  visible: boolean
  /** Previous and next buttons and swipes (a playlist, not a single track). */
  navigation: boolean
}>()

/** Play/pause: the page decides (it may have to load its item first). */
const emit = defineEmits<{ toggle: [] }>()

// The track, state and controls.
const player = usePlayerStore()

/** What the bar shows (the queued summary while the full data loads). */
const track = computed(() => player.displayTrack)

/** Cover and title: tap for the full-screen view, swipe to change track. */
const trackArea = ref<HTMLElement | null>(null)
/** Swipes on the cover and title, touch only; a single track has nowhere to go sideways but the start. */
const swipe = useTrackSwipe(trackArea, {
  canNext: () => props.navigation && player.hasNext,
  onNext: () => void player.next(),
  onPrevious: () => void player.previous(),
  onOpen: () => player.setExpanded(true),
})
/** Cover and title while swiped: they follow the finger and fade (the same feel as the app's bar). */
const swipeStyle = computed(() => ({
  transform: swipe.offset.value ? `translateX(${swipe.offset.value}px)` : undefined,
  opacity: swipe.offset.value ? Math.max(0.3, 1 - Math.abs(swipe.offset.value) / 250) : undefined,
  transition: swipe.dragging.value ? 'none' : 'transform 200ms ease-out, opacity 200ms ease-out',
}))

/** The play button spins while the track loads or buffers. */
const waiting = computed(() => player.status === 'loading' || player.buffering)
</script>

<template>
  <!-- Slides up from the bottom edge when the page's player leaves the screen -->
  <Transition
    enter-from-class="translate-y-full"
    leave-to-class="translate-y-full"
    enter-active-class="transition-transform duration-200 ease-out"
    leave-active-class="transition-transform duration-150 ease-in"
  >
    <div
      v-if="visible"
      class="fixed inset-x-0 bottom-0 z-40 border-t border-default bg-default/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      data-testid="shared-mini-player"
    >
      <!-- Thin progress line on top, spectral blue like the waveform's played part -->
      <div class="h-0.5 bg-accented">
        <div
          class="h-full bg-secondary"
          :style="{ width: `${player.progress * 100}%` }"
        />
      </div>

      <UContainer class="flex h-16 items-center gap-2">
        <!--
          Cover and title: tap for the full-screen view. `touch-none`: the swipes are
          handled here, so the browser must not scroll or navigate from it.
        -->
        <button
          ref="trackArea"
          type="button"
          class="flex min-w-0 flex-1 cursor-pointer touch-none items-center text-left"
          aria-label="Open player"
          data-testid="shared-mini-open"
          @click="player.setExpanded(true)"
        >
          <span
            class="flex min-w-0 items-center gap-3"
            :style="swipeStyle"
          >
            <TrackCover
              :url="track?.coverUrl"
              :title="track?.title"
              class="size-10"
            />
            <span class="min-w-0">
              <span class="block truncate font-medium">{{ track?.title }}</span>
              <span
                v-if="player.status === 'error'"
                class="block truncate text-sm text-error"
              >{{ player.error }}</span>
              <span
                v-else
                class="block truncate text-sm text-muted"
              >{{ track?.composers || '—' }}</span>
            </span>
          </span>
        </button>

        <!-- Previous / play-pause / next (previous and next for playlists) -->
        <IconButton
          v-if="navigation"
          icon="i-lucide-skip-back"
          color="neutral"
          variant="ghost"
          label="Previous track"
          :aria-keyshortcuts="ariaShortcut('previous')"
          @click="player.previous()"
        />
        <IconButton
          :icon="waiting ? 'i-lucide-loader-circle' : player.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
          class="rounded-full"
          :ui="{ leadingIcon: waiting ? 'animate-spin' : '' }"
          :label="player.isPlaying ? 'Pause' : 'Play'"
          data-testid="shared-mini-toggle"
          :aria-keyshortcuts="ariaShortcut('toggle-play')"
          @click="emit('toggle')"
        />
        <IconButton
          v-if="navigation"
          icon="i-lucide-skip-forward"
          color="neutral"
          variant="ghost"
          label="Next track"
          :aria-keyshortcuts="ariaShortcut('next')"
          :disabled="!player.hasNext"
          @click="player.next()"
        />
      </UContainer>
    </div>
  </Transition>
</template>
