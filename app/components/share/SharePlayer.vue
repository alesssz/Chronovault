<script setup lang="ts">
/**
 * Player of the public share pages: a big play/pause button, the waveform
 * with elapsed and total time, and the player's error message.
 *
 * The audio itself is the app-wide player (store + engine); `active` tells
 * whether the player currently holds this page's item. Until it does, the
 * times show 0 and `duration` (from the item's data) and the button asks
 * the page to start (`toggle`).
 */
defineProps<{
  /** The player holds this page's track (or a track of this page's playlist). */
  active: boolean
  /** Duration to show before the player is loaded (seconds). */
  duration: number | null
}>()

const emit = defineEmits<{ toggle: [] }>()

const player = usePlayerStore()
</script>

<template>
  <div>
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

    <p
      v-if="active && player.status === 'error'"
      class="mt-6 text-sm text-error"
    >
      {{ player.error }}
    </p>
  </div>
</template>
