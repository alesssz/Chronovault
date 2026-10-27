<script setup lang="ts">
import { formatLrcTimestamp } from '~~/shared/utils/lyrics'

/**
 * The playback time in the lyrics sync editor's controls, as an LRC
 * timestamp (`01:23.45`). A component of its own on purpose: the time changes
 * on every animation frame while playing, and read in the editor's template it
 * made the whole editor, every row included, render again ~60 times a second.
 */

// The playback position.
const player = usePlayerStore()
</script>

<template>
  <span class="w-20 text-center font-mono text-sm tabular-nums">{{ formatLrcTimestamp(player.currentTime) }}</span>
</template>
