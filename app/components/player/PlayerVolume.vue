<script setup lang="ts">
import { pageControlsVolume } from '~/lib/audio-engine'
import { ariaShortcut } from '~/lib/keyboard-shortcuts'

/**
 * Mute button + volume slider. The slider shows 0 while muted; moving it
 * above 0 unmutes (handled by the store's setVolume).
 *
 * Two layouts:
 * - default: the mute button with a horizontal slider beside it (desktop
 *   player bar, full-screen view, share pages);
 * - `compact`: a single speaker button that opens a small popover with the
 *   mute button and a vertical slider, for the player bar of a narrow
 *   window (`md` to `lg`), where a horizontal slider does not fit.
 *
 * The slider exists only with a mouse or trackpad (pageControlsVolume). On
 * touch screens, phones and tablets alike, the hardware buttons own the
 * volume and the page plays at full level: a second level here would only
 * multiply with theirs, so only the mute button is shown, in both layouts
 * (on iPhone and iPad the page could not set the volume anyway).
 *
 * The mute button announces its keyboard shortcut, M, to screen readers
 * (aria-keyshortcuts, app/lib/keyboard-shortcuts.ts).
 */
withDefaults(defineProps<{
  /** Speaker button + popover instead of an inline slider. */
  compact?: boolean
}>(), { compact: false })

// The level, mute and their commands.
const player = usePlayerStore()

/**
 * Whether this device gets a volume slider (see pageControlsVolume). true
 * until mounted: the server cannot know, and the first client render must
 * match its HTML.
 */
const adjustable = ref(true)
/**
 * Mounted in the browser: until then the level shown is the server's, full
 * volume. The level saved on this device (kept out of server-rendered state,
 * see the player store) is not known on the server, and a first client
 * render showing it would not match the server's HTML: Vue does not fix such
 * a difference in attributes and styles, so on a share page the slider and
 * the icon went on showing 100% while the audio played at the saved level.
 * Switching once mounted is an ordinary update, which Vue applies.
 */
const mounted = ref(false)
// Decided in the browser: touch screens leave the volume to the hardware buttons.
onMounted(() => {
  adjustable.value = pageControlsVolume()
  mounted.value = true
})

/** The level shown (0..1): the player's once mounted, the server's full volume before (mute is never saved). */
const shownVolume = computed(() => (mounted.value ? player.volume : 1))

/** Speaker icon: muted, low or high. */
const icon = computed(() => {
  if (player.muted || shownVolume.value === 0) return 'i-lucide-volume-x'
  return shownVolume.value < 0.5 ? 'i-lucide-volume-1' : 'i-lucide-volume-2'
})

/** Slider value 0..100 (0 while muted); writing it sets the volume. */
const level = computed({
  get: () => (player.muted ? 0 : Math.round(shownVolume.value * 100)),
  set: (value: number) => player.setVolume(value / 100),
})
</script>

<template>
  <div v-if="compact && adjustable">
    <!--
      Compact (narrow player bar) with a slider (a mouse or trackpad): speaker button opening a
      popover. The wrapper gives the parent's classes (e.g. `lg:hidden`) an element to land on:
      the popover itself renders none. The comments of both branches stay inside them: at the
      root, the server renderer counted them as root nodes and dropped the parent's classes
      (see PlaylistCover).
    -->
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
            :aria-keyshortcuts="ariaShortcut('mute')"
            @click="player.toggleMute()"
          />
        </div>
      </template>
    </UPopover>
  </div>

  <div
    v-else
    class="flex items-center gap-2"
  >
    <!-- Inline layout, or mute alone where the page offers no volume of its own (touch screens) -->
    <IconButton
      :icon="icon"
      color="neutral"
      variant="ghost"
      :label="player.muted ? 'Unmute' : 'Mute'"
      :aria-keyshortcuts="ariaShortcut('mute')"
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
