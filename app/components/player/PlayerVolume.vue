<script setup lang="ts">
import { canSetVolume } from '~/lib/audio-engine'

/**
 * Mute button + volume slider. The slider shows 0 while muted; moving it
 * above 0 unmutes (handled by the store's setVolume).
 *
 * Two layouts:
 * - default: the mute button with a horizontal slider beside it (desktop
 *   player bar, full-screen view);
 * - `compact`: a single speaker button that opens a small popover with the
 *   mute button and a vertical slider, for the tablet-width player bar,
 *   where a horizontal slider does not fit.
 *
 * Where the page cannot set the volume (iPhone, iPad: the hardware buttons
 * own it, see canSetVolume) a slider would do nothing, so only the mute
 * button is shown, in both layouts.
 */
withDefaults(defineProps<{
  /** Speaker button + popover instead of an inline slider. */
  compact?: boolean
}>(), { compact: false })

const player = usePlayerStore()

/**
 * Whether a volume slider makes sense on this device. true until mounted:
 * the server cannot know, and the first client render must match its HTML.
 */
const adjustable = ref(true)
onMounted(() => {
  adjustable.value = canSetVolume()
})

/** Speaker icon: muted, low or high. */
const icon = computed(() => {
  if (player.muted || player.volume === 0) return 'i-lucide-volume-x'
  return player.volume < 0.5 ? 'i-lucide-volume-1' : 'i-lucide-volume-2'
})

/** Slider value 0..100 (0 while muted); writing it sets the volume. */
const level = computed({
  get: () => (player.muted ? 0 : Math.round(player.volume * 100)),
  set: (value: number) => player.setVolume(value / 100),
})
</script>

<template>
  <!--
    Compact (tablet bar) with a usable slider: speaker button opening a popover.
    The wrapper gives the parent's classes (e.g. `lg:hidden`) an element to land on:
    the popover itself renders none.
  -->
  <div v-if="compact && adjustable">
    <UPopover :content="{ side: 'top', align: 'center' }">
      <IconButton
        :icon="icon"
        color="neutral"
        variant="ghost"
        label="Volume"
        data-testid="player-volume-compact"
      />
      <template #content>
        <!-- Slider on top, mute under it: the order of a phone's volume panel -->
        <div class="flex flex-col items-center gap-2 p-2">
          <USlider
            v-model="level"
            :min="0"
            :max="100"
            size="sm"
            orientation="vertical"
            class="h-32"
            aria-label="Volume"
          />
          <IconButton
            :icon="icon"
            color="neutral"
            variant="ghost"
            :label="player.muted ? 'Unmute' : 'Mute'"
            @click="player.toggleMute()"
          />
        </div>
      </template>
    </UPopover>
  </div>

  <!-- Inline layout, or mute only where the volume cannot be set -->
  <div
    v-else
    class="flex items-center gap-2"
  >
    <IconButton
      :icon="icon"
      color="neutral"
      variant="ghost"
      :label="player.muted ? 'Unmute' : 'Mute'"
      @click="player.toggleMute()"
    />
    <USlider
      v-if="adjustable"
      v-model="level"
      :min="0"
      :max="100"
      size="sm"
      class="w-24"
      aria-label="Volume"
    />
  </div>
</template>
