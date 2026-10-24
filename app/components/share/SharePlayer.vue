<script setup lang="ts">
/**
 * Player of the public share pages: a big play/pause button and the
 * waveform with elapsed and total time; under them previous / next (for
 * playlists), the volume and the full-screen view; and the player's error
 * message.
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
 */
defineProps<{
  /** The player holds this page's track (or a track of this page's playlist). */
  active: boolean
  /** Duration to show before the player is loaded (seconds). */
  duration: number | null
  /** Previous and next track (a playlist; a single track has none). */
  navigation?: boolean
}>()

/** Play/pause: the page decides (it may have to load its item first). */
const emit = defineEmits<{ toggle: [] }>()

// The app-wide player: state for the display, commands for the buttons.
const player = usePlayerStore()

/** This player's root: while it is on screen the mini player stays away. */
const root = ref<HTMLElement | null>(null)
/** This player is (at least partly) on screen. */
const onScreen = useElementVisibility(root)
</script>

<template>
  <div ref="root">
    <!-- Play button, waveform and times -->
    <div class="flex items-center gap-4">
      <IconButton
        :icon="active && player.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
        :label="active && player.isPlaying ? 'Pause' : 'Play'"
        :loading="active && player.status === 'loading'"
        size="xl"
        class="shrink-0 rounded-full p-4"
        data-testid="shared-play"
        @click="emit('toggle')"
      />
      <div class="min-w-0 flex-1">
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
    </div>

    <!-- Second row: previous / next (playlists) on the left; volume and full screen on the right -->
    <div class="mt-2 flex items-center justify-between gap-2">
      <div class="flex items-center gap-1">
        <template v-if="navigation">
          <IconButton
            icon="i-lucide-skip-back"
            color="neutral"
            variant="ghost"
            label="Previous track"
            :disabled="!active"
            data-testid="shared-previous"
            @click="player.previous()"
          />
          <IconButton
            icon="i-lucide-skip-forward"
            color="neutral"
            variant="ghost"
            label="Next track"
            :disabled="!active || !player.hasNext"
            data-testid="shared-next"
            @click="player.next()"
          />
        </template>
      </div>
      <div class="flex items-center gap-1">
        <!-- Mute and slider (mute only where the page cannot set the volume: iPhone, iPad) -->
        <PlayerVolume />
        <!-- The full-screen view: big cover, controls, synced lyrics -->
        <IconButton
          icon="i-lucide-maximize-2"
          color="neutral"
          variant="ghost"
          label="Full screen"
          :disabled="!active || !player.current"
          data-testid="shared-expand"
          @click="player.setExpanded(true)"
        />
      </div>
    </div>

    <p
      v-if="active && player.status === 'error'"
      class="mt-6 text-sm text-error"
    >
      {{ player.error }}
    </p>

    <!-- The same controls at the bottom of the screen while this player is scrolled away -->
    <ShareMiniPlayer
      v-if="active"
      :visible="!onScreen"
      :navigation="navigation"
      @toggle="emit('toggle')"
    />
  </div>
</template>
