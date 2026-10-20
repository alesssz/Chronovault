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

const player = usePlayerStore()
const container = ref<HTMLElement | null>(null)
let wavesurfer: WaveSurfer | null = null

const KEY_STEP = 5

function onKeydown(event: KeyboardEvent) {
  const step = event.key === 'ArrowRight' ? KEY_STEP : event.key === 'ArrowLeft' ? -KEY_STEP : 0
  if (!step) return
  event.preventDefault()
  player.seek(player.currentTime + step)
}

/** Flat fallback shape for tracks without peaks. */
const FLAT_PEAKS = Array.from({ length: 200 }, () => 0.2)

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
