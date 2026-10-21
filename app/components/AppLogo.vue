<script setup lang="ts">
/**
 * ChronoPlayer wordmark: waveform icon + name. Inherits the font size of
 * its parent (the icon is sized in `em`).
 * `compact`: on narrow screens only the icon is shown (e.g. in the app header).
 */
defineProps<{ compact?: boolean }>()
</script>

<template>
  <span class="inline-flex items-center gap-2 font-semibold tracking-tight">
    <UIcon
      name="i-lucide-audio-waveform"
      class="size-[1.2em] text-primary"
    />
    <span :class="{ 'hidden sm:inline': compact }">Chrono<span class="text-primary">Player</span></span>
  </span>
</template>
