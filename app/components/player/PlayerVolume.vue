<script setup lang="ts">
/**
 * Mute button + volume slider. The slider shows 0 while muted; moving it
 * above 0 unmutes (handled by the store's setVolume).
 */
const player = usePlayerStore()

const icon = computed(() => {
  if (player.muted || player.volume === 0) return 'i-lucide-volume-x'
  return player.volume < 0.5 ? 'i-lucide-volume-1' : 'i-lucide-volume-2'
})

const level = computed({
  get: () => (player.muted ? 0 : Math.round(player.volume * 100)),
  set: (value: number) => player.setVolume(value / 100),
})
</script>

<template>
  <div class="flex items-center gap-2">
    <UButton
      :icon="icon"
      color="neutral"
      variant="ghost"
      :aria-label="player.muted ? 'Unmute' : 'Mute'"
      @click="player.toggleMute()"
    />
    <USlider
      v-model="level"
      :min="0"
      :max="100"
      size="sm"
      class="w-24"
      aria-label="Volume"
    />
  </div>
</template>
