<script setup lang="ts">
/**
 * Transport buttons (shuffle, stop, previous, play/pause, next, repeat)
 * bound to the player store. Used by the player bar and the full-screen view
 * (`size` differs). The play button turns into a spinner while loading or
 * buffering; shuffle and repeat appear only for library playback.
 */
withDefaults(defineProps<{
  size?: 'md' | 'lg' | 'xl'
  showStop?: boolean
  /** Shuffle and repeat buttons (the compact phone bar has no room for them). */
  showModes?: boolean
  /** Extra classes for the shuffle and repeat buttons (e.g. shown only from a breakpoint). */
  modesClass?: string
}>(), {
  size: 'md',
  showStop: true,
  showModes: true,
})

// Every button calls the store; states come from it too.
const player = usePlayerStore()
</script>

<template>
  <div class="flex items-center gap-1">
    <UButton
      v-if="showModes && player.queueEditable"
      :class="modesClass"
      icon="i-lucide-shuffle"
      :color="player.shuffle ? 'primary' : 'neutral'"
      variant="ghost"
      :size="size"
      :aria-label="`Shuffle: ${player.shuffle ? 'on' : 'off'}`"
      :aria-pressed="player.shuffle"
      data-testid="player-shuffle"
      @click="player.setShuffle(!player.shuffle)"
    />
    <UButton
      v-if="showStop"
      icon="i-lucide-square"
      color="neutral"
      variant="ghost"
      :size="size"
      aria-label="Stop"
      :disabled="player.status === 'loading'"
      @click="player.stop()"
    />
    <UButton
      icon="i-lucide-skip-back"
      color="neutral"
      variant="ghost"
      :size="size"
      aria-label="Previous track"
      @click="player.previous()"
    />
    <UButton
      :icon="player.status === 'loading' || player.buffering ? 'i-lucide-loader-circle' : player.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
      :size="size"
      class="rounded-full"
      :ui="{ leadingIcon: player.status === 'loading' || player.buffering ? 'animate-spin' : '' }"
      :aria-label="player.isPlaying ? 'Pause' : 'Play'"
      data-testid="player-toggle"
      @click="player.togglePlay()"
    />
    <UButton
      icon="i-lucide-skip-forward"
      color="neutral"
      variant="ghost"
      :size="size"
      aria-label="Next track"
      :disabled="!player.hasNext"
      @click="player.next()"
    />
    <UButton
      v-if="showModes && player.queueEditable"
      :class="modesClass"
      :icon="player.repeat === 'one' ? 'i-lucide-repeat-1' : 'i-lucide-repeat'"
      :color="player.repeat === 'off' ? 'neutral' : 'primary'"
      variant="ghost"
      :size="size"
      :aria-label="`Repeat: ${player.repeat}`"
      :aria-pressed="player.repeat !== 'off'"
      data-testid="player-repeat"
      @click="player.cycleRepeat()"
    />
  </div>
</template>
