<script setup lang="ts">
import { ariaShortcut } from '~/lib/keyboard-shortcuts'
/**
 * Player of the public share pages: the waveform with elapsed and total
 * time; under it one symmetric row, the volume on the left, a big
 * play/pause in the middle (between previous / next, for playlists) and the
 * full-screen view on the right; and the player's error message.
 *
 * The share pages have no player bar (public layout): this is their player.
 * So that its controls never get out of reach, it also brings:
 * - ShareMiniPlayer, a bar fixed at the bottom of the screen while this
 *   player has scrolled out of view (a long list, the lyrics on a phone);
 * - the full-screen view (PlayerExpanded, mounted by the public layout),
 *   with the synced lyrics and the phones' lyrics view.
 *
 * The audio itself is the app-wide player (store + engine); `active` tells
 * whether the player currently holds this page's item. Until it does, the
 * times show 0 and `duration` (from the item's data) and the button asks
 * the page to start (`toggle`); the other controls wait.
 *
 * Play, previous, next and full screen announce their keyboard shortcut to
 * screen readers (aria-keyshortcuts, app/lib/keyboard-shortcuts.ts).
 *
 * Whether the mini player is on screen is shared (`share-mini-player`): the
 * public layout keeps room for it at the bottom only then, so a page that
 * does not need it does not scroll by that room.
 *
 * `bar`: the same controls as a bar fixed at the bottom of the screen, the
 * whole width, in one row (play, time, waveform, duration, volume, then the
 * page's `actions` slot: the track page's Download). The track page uses it
 * from `md`, where it is always in view, so it brings no mini player. Nor a
 * full-screen button: the full-screen view has that page's own layout there,
 * so it only opened the same thing again (the F key still opens it).
 */
const props = defineProps<{
  /** The player holds this page's track (or a track of this page's playlist). */
  active: boolean
  /** Duration to show before the player is loaded (seconds). */
  duration: number | null
  /** Previous and next track (a playlist; a single track has none). */
  navigation?: boolean
  /** A bar fixed at the bottom of the screen instead of a block in the page (see above). */
  bar?: boolean
}>()

/** Play/pause: the page decides (it may have to load its item first). */
const emit = defineEmits<{ toggle: [] }>()

// The app-wide player: state for the display, commands for the buttons.
const player = usePlayerStore()

/** This player's root: while it is on screen the mini player stays away. */
const root = ref<HTMLElement | null>(null)
/** This player is (at least partly) on screen. */
const onScreen = useElementVisibility(root)
/** The mini player is shown: this player holds the page's item and is off screen (read by the public layout). */
const miniPlayerShown = useState('share-mini-player', () => false)
watchEffect(() => {
  miniPlayerShown.value = !props.bar && props.active && !onScreen.value
})
// Leaving the page takes the mini player, and its room, away.
onBeforeUnmount(() => {
  miniPlayerShown.value = false
})
</script>

<template>
  <div
    v-if="bar"
    class="fixed inset-x-0 bottom-0 z-40 border-t border-default bg-default/95 backdrop-blur"
    data-testid="shared-bar"
  >
    <!-- The bar: one row at the bottom of the screen, always in view (no mini player). Comments stay inside the roots (see PlaylistCover). -->
    <!-- As wide as the track page's content (max-w-6xl), so play sits under the cover's edge and the last control under the panel's -->
    <UContainer>
      <div class="mx-auto flex h-18 max-w-6xl items-center gap-4">
        <IconButton
          :icon="active && player.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
          :label="active && player.isPlaying ? 'Pause' : 'Play'"
          :loading="active && player.status === 'loading'"
          size="xl"
          class="shrink-0 rounded-full p-3"
          data-testid="shared-play"
          :aria-keyshortcuts="ariaShortcut('toggle-play')"
          @click="emit('toggle')"
        />
        <span class="w-10 shrink-0 text-right text-xs tabular-nums text-muted">{{ formatTime(active ? player.currentTime : 0) }}</span>
        <div
          class="min-w-0 flex-1"
          data-testid="shared-waveform"
        >
          <!-- The waveform needs the browser's audio element: client only. -->
          <ClientOnly>
            <PlayerWaveform
              v-if="active && player.current"
              :key="player.current.id"
              :peaks="player.current.peaks"
              :duration="player.duration"
              :height="40"
            />
            <template #fallback>
              <div class="h-10" />
            </template>
          </ClientOnly>
          <!-- Why the track could not play (marked for the tests) -->
          <p
            v-if="active && player.status === 'error'"
            class="truncate text-xs text-error"
            data-testid="shared-error"
          >
            {{ player.error }}
          </p>
        </div>
        <span class="w-10 shrink-0 text-xs tabular-nums text-muted">{{ formatTime(active ? player.duration : duration) }}</span>
        <!-- Mute and slider -->
        <PlayerVolume class="shrink-0" />
        <slot name="actions" />
      </div>
    </UContainer>
  </div>

  <div
    v-else
    ref="root"
  >
    <!-- The waveform, the whole width, with elapsed and total time -->
    <div data-testid="shared-waveform">
      <!-- The waveform needs the browser's audio element: client only. -->
      <ClientOnly>
        <PlayerWaveform
          v-if="active && player.current"
          :key="player.current.id"
          :peaks="player.current.peaks"
          :duration="player.duration"
          :height="56"
        />
        <template #fallback>
          <div class="h-14" />
        </template>
      </ClientOnly>
      <div class="mt-1 flex justify-between text-xs tabular-nums text-muted">
        <span>{{ formatTime(active ? player.currentTime : 0) }}</span>
        <span>{{ formatTime(active ? player.duration : duration) }}</span>
      </div>
    </div>

    <!--
      Under it, one symmetric row, as in the app's full-screen view: the volume on the left, play
      (with previous / next on playlists) exactly in the middle (two equal side columns), full
      screen on the right. The outer icons sit on the waveform's edges (-ml/-mr-1.5: a ghost
      button's padding). Before, play sat beside the waveform and a second row ran under both,
      which left a single track's volume and full screen floating on the right.
    -->
    <div class="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
      <div class="-ml-1.5 flex min-w-0 items-center justify-self-start">
        <!--
          Mute and slider (mute only on touch screens: the hardware buttons own the volume there).
          A window narrower than `sm` with a mouse gets the speaker button and its popover instead,
          so the slider never runs into the controls in the middle.
        -->
        <PlayerVolume class="max-sm:hidden" />
        <PlayerVolume
          compact
          class="sm:hidden"
        />
      </div>

      <div class="flex items-center gap-3">
        <IconButton
          v-if="navigation"
          icon="i-lucide-skip-back"
          color="neutral"
          variant="ghost"
          size="lg"
          label="Previous track"
          :aria-keyshortcuts="ariaShortcut('previous')"
          :disabled="!active"
          data-testid="shared-previous"
          @click="player.previous()"
        />
        <IconButton
          :icon="active && player.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
          :label="active && player.isPlaying ? 'Pause' : 'Play'"
          :loading="active && player.status === 'loading'"
          size="xl"
          class="shrink-0 rounded-full p-4"
          data-testid="shared-play"
          :aria-keyshortcuts="ariaShortcut('toggle-play')"
          @click="emit('toggle')"
        />
        <IconButton
          v-if="navigation"
          icon="i-lucide-skip-forward"
          color="neutral"
          variant="ghost"
          size="lg"
          label="Next track"
          :aria-keyshortcuts="ariaShortcut('next')"
          :disabled="!active || !player.hasNext"
          data-testid="shared-next"
          @click="player.next()"
        />
      </div>

      <!-- The full-screen view: big cover, controls, synced lyrics -->
      <IconButton
        icon="i-lucide-maximize-2"
        color="neutral"
        variant="ghost"
        label="Full screen"
        :aria-keyshortcuts="ariaShortcut('full-screen')"
        :disabled="!active || !player.current"
        class="-mr-1.5 justify-self-end"
        data-testid="shared-expand"
        @click="player.setExpanded(true)"
      />
    </div>

    <!-- Why the track could not play (marked for the tests) -->
    <p
      v-if="active && player.status === 'error'"
      class="mt-6 text-sm text-error"
      data-testid="shared-error"
    >
      {{ player.error }}
    </p>

    <!-- The same controls at the bottom of the screen while this player is scrolled away -->
    <ShareMiniPlayer
      v-if="active"
      :visible="miniPlayerShown"
      :navigation="navigation"
      @toggle="emit('toggle')"
    />
  </div>
</template>
