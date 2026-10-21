<script setup lang="ts">
import WaveSurfer from 'wavesurfer.js'
import { getAudioEngine } from '~/lib/audio-engine'
import { themeColor } from '~/lib/theme'

/**
 * Interactive waveform (click and drag to scrub).
 * Uses the engine's shared audio element and the peaks stored in the
 * database: the file is never downloaded or decoded again.
 */
const props = withDefaults(defineProps<{
  peaks: number[] | null
  duration: number
  height?: number
}>(), {
  height: 48,
})

// Position for the slider semantics, and seek() for the keyboard.
const player = usePlayerStore()
/** Where wavesurfer draws. */
const container = ref<HTMLElement | null>(null)
/** The wavesurfer instance (not reactive: it is a big imperative object). */
let wavesurfer: WaveSurfer | null = null

/** Seconds moved by ← / → when the waveform has focus. */
const KEY_STEP = 5

/** Keyboard seeking (the waveform is a focusable slider for screen readers). */
function onKeydown(event: KeyboardEvent) {
  const step = event.key === 'ArrowRight' ? KEY_STEP : event.key === 'ArrowLeft' ? -KEY_STEP : 0
  if (!step) return
  event.preventDefault()
  player.seek(player.currentTime + step)
}

/** Flat fallback shape for tracks without peaks. */
const FLAT_PEAKS = Array.from({ length: 200 }, () => 0.2)

/**
 * (Re)builds the waveform on the shared audio element, with the stored
 * peaks: nothing is downloaded or decoded. Theme colors are read at build time.
 */
function create() {
  const media = getAudioEngine().element
  if (!container.value || !media || props.duration <= 0) return
  wavesurfer?.destroy()
  wavesurfer = WaveSurfer.create({
    container: container.value,
    media,
    peaks: [props.peaks?.length ? props.peaks : FLAT_PEAKS],
    duration: props.duration,
    height: props.height,
    waveColor: themeColor('--ui-border-accented', '#3f3f46'),
    progressColor: themeColor('--ui-primary', '#f97316'),
    cursorColor: themeColor('--ui-text-highlighted', '#fafafa'),
    cursorWidth: 1,
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    normalize: true,
    dragToSeek: true,
    hideScrollbar: true,
  })
}

onMounted(create)
onBeforeUnmount(() => {
  wavesurfer?.destroy()
  wavesurfer = null
})

// The duration may arrive later (audio metadata): rebuild the waveform.
watch(() => props.duration, (value, old) => {
  if (value > 0 && Math.abs(value - old) > 0.5) create()
})

// Colors depend on the light/dark theme.
const colorMode = useColorMode()
// Rebuild after the theme switch has applied (nextTick), to pick up the new colors.
watch(() => colorMode.value, () => nextTick(create))
</script>

<template>
  <div
    ref="container"
    class="w-full cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    :style="{ height: `${height}px` }"
    role="slider"
    tabindex="0"
    aria-label="Position in track"
    aria-valuemin="0"
    :aria-valuemax="Math.round(duration)"
    :aria-valuenow="Math.round(player.currentTime)"
    :aria-valuetext="`${formatTime(player.currentTime)} of ${formatTime(duration)}`"
    @keydown="onKeydown"
  />
</template>
