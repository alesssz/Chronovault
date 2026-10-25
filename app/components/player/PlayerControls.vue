<script setup lang="ts">
/**
 * Transport buttons (shuffle, stop, previous, play/pause, next, repeat)
 * bound to the player store. Used by the player bar and the full-screen view
 * (`size` differs). The play button turns into a spinner while loading or
 * buffering; shuffle and repeat appear only for library playback. Every
 * button is an IconButton: its label is also its tooltip. Previous, play and
 * next announce their keyboard shortcut to screen readers (aria-keyshortcuts).
 */
import { ariaShortcut } from '~/lib/keyboard-shortcuts'

withDefaults(defineProps<{
  /** Button size (larger in the full-screen view). */
  size?: 'md' | 'lg' | 'xl'
  /** The Stop button (left out where there is no room for it). */
  showStop?: boolean
  /** Shuffle and repeat buttons (the compact phone bar has no room for them). */
  showModes?: boolean
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
    <!-- Shuffle (library playback only, where there is a queue to shuffle) -->
    <IconButton
      v-if="showModes && player.queueEditable"
      icon="i-lucide-shuffle"
      :color="player.shuffle ? 'primary' : 'neutral'"
      variant="ghost"
      :size="size"
      :label="`Shuffle: ${player.shuffle ? 'on' : 'off'}`"
      :aria-pressed="player.shuffle"
      data-testid="player-shuffle"
      @click="player.setShuffle(!player.shuffle)"
    />
    <!-- Stop: pause and back to the start (left out where the parent passes show-stop false) -->
    <IconButton
      v-if="showStop"
      icon="i-lucide-square"
      color="neutral"
      variant="ghost"
      :size="size"
      label="Stop"
      :disabled="player.status === 'loading'"
      @click="player.stop()"
    />
    <!-- Previous track (or the start of this one, a few seconds in) -->
    <IconButton
      icon="i-lucide-skip-back"
      color="neutral"
      variant="ghost"
      :size="size"
      label="Previous track"
      :aria-keyshortcuts="ariaShortcut('previous')"
      @click="player.previous()"
    />
    <!-- Play / pause, spinning while the track loads or waits for data -->
    <IconButton
      :icon="player.status === 'loading' || player.buffering ? 'i-lucide-loader-circle' : player.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
      :size="size"
      class="rounded-full"
      :ui="{ leadingIcon: player.status === 'loading' || player.buffering ? 'animate-spin' : '' }"
      :label="player.isPlaying ? 'Pause' : 'Play'"
      :aria-keyshortcuts="ariaShortcut('toggle-play')"
      data-testid="player-toggle"
      @click="player.togglePlay()"
    />
    <!-- Next track (disabled after the last one, unless the queue loops) -->
    <IconButton
      icon="i-lucide-skip-forward"
      color="neutral"
      variant="ghost"
      :size="size"
      label="Next track"
      :aria-keyshortcuts="ariaShortcut('next')"
      :disabled="!player.hasNext"
      @click="player.next()"
    />
    <!-- Repeat: off, all, one (library playback only) -->
    <IconButton
      v-if="showModes && player.queueEditable"
      :icon="player.repeat === 'one' ? 'i-lucide-repeat-1' : 'i-lucide-repeat'"
      :color="player.repeat === 'off' ? 'neutral' : 'primary'"
      variant="ghost"
      :size="size"
      :label="`Repeat: ${player.repeat}`"
      :aria-pressed="player.repeat !== 'off'"
      data-testid="player-repeat"
      @click="player.cycleRepeat()"
    />
  </div>
</template>
