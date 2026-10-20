<script setup lang="ts">
withDefaults(defineProps<{
  size?: 'md' | 'lg' | 'xl'
  showStop?: boolean
}>(), {
  size: 'md',
  showStop: true,
})

const player = usePlayerStore()
</script>

<template>
  <div class="flex items-center gap-1">
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
  </div>
</template>
