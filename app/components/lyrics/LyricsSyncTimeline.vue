<script setup lang="ts">
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import type { SyncRow } from '~~/shared/utils/lyrics'
import { getAudioEngine } from '~/lib/audio-engine'
import { themeColor } from '~/lib/theme'

/**
 * Zoomable, detailed waveform of the track being synced. It follows playback
 * and shows one draggable marker per synced line: drag a marker to move the
 * start of its line to where the voice actually comes in.
 *
 * Unlike the player waveform (1000 stored peaks for the whole track), this one
 * decodes the audio itself: seeing where a phrase starts needs full detail.
 */
const props = defineProps<{
  rows: SyncRow[]
  /** Index of the selected row (highlighted marker). */
  selected: number | null
}>()

const emit = defineEmits<{
  move: [index: number, time: number]
  select: [index: number]
}>()

/** Zoom range of the slider, in pixels per second. */
const MIN_ZOOM = 20
// (400 px per second: one second spans most of a phone screen.)
const MAX_ZOOM = 400

/** Where wavesurfer draws. */
const container = ref<HTMLElement | null>(null)
/** Pixels per second of audio. */
const zoom = ref(80)
/** Download/decoding progress of the detailed waveform (0..100). */
const loadingPercent = ref(0)
/** Waveform decoded: markers can be drawn. */
const ready = ref(false)
/** Decoding failed (e.g. expired URL or unsupported codec): a notice replaces the waveform. */
const failed = ref(false)

/** Waveform and its Regions plugin (the markers); recreated on mount. */
let wavesurfer: WaveSurfer | null = null
/** The Regions plugin instance: one region per marker. */
let regions: ReturnType<typeof RegionsPlugin.create> | null = null

/** A synced lyric line drawn on the waveform. */
interface Marker {
  /** Index in `rows` (section headers included). */
  index: number
  /** 1-based number among lyric lines, as shown in the list. */
  number: number
  time: number
  text: string
}

/** One marker per synced lyric line, numbered like the lines in the list. */
const markers = computed<Marker[]>(() => {
  // Lyric lines are numbered 1, 2, 3… skipping section headers.
  let number = 0
  return props.rows.flatMap((row, index) => {
    if (row.section) return []
    number++
    return row.time == null ? [] : [{ index, number, time: row.time, text: row.text }]
  })
})

/** Small label shown on a marker: number and the first characters of the line. */
function markerLabel(marker: Marker): HTMLElement {
  // Rendered inside wavesurfer's shadow DOM: inline styles, no Tailwind classes.
  const label = document.createElement('div')
  label.dataset.testid = 'sync-marker'
  label.textContent = `${marker.number}. ${marker.text.length > 28 ? `${marker.text.slice(0, 27)}…` : marker.text || '♪'}`
  Object.assign(label.style, {
    fontSize: '11px',
    lineHeight: '1.3',
    padding: '1px 6px',
    marginLeft: '2px',
    borderRadius: '4px',
    background: 'rgba(0, 0, 0, 0.6)',
    color: '#fff',
    whiteSpace: 'nowrap',
    cursor: 'grab',
  })
  return label
}

/** Redraws every marker (cheap: a few dozen regions). The selected one is highlighted. */
function renderMarkers() {
  if (!regions || !ready.value) return
  regions.clearRegions()
  const accent = themeColor('--ui-primary', '#f97316')
  const highlight = themeColor('--ui-text-highlighted', '#fafafa')
  for (const marker of markers.value) {
    regions.addRegion({
      id: `line-${marker.index}`,
      start: marker.time,
      drag: true,
      resize: false,
      color: marker.index === props.selected ? highlight : accent,
      content: markerLabel(marker),
    })
  }
}

/** Region id (`line-<index>`) → row index. */
function indexOf(regionId: string): number {
  return Number(regionId.replace('line-', ''))
}

/** Builds the waveform on the shared audio element (rebuilt from scratch every time). */
function create() {
  const media = getAudioEngine().element
  if (!container.value || !media) return
  destroy()
  ready.value = false
  failed.value = false
  loadingPercent.value = 0

  regions = RegionsPlugin.create()
  wavesurfer = WaveSurfer.create({
    container: container.value,
    // Same audio element as the player: no peaks given, so wavesurfer fetches
    // and decodes the file itself for a detailed waveform.
    media,
    height: 112,
    minPxPerSec: zoom.value,
    autoScroll: true,
    autoCenter: true,
    dragToSeek: true,
    normalize: true,
    waveColor: themeColor('--ui-border-accented', '#3f3f46'),
    progressColor: themeColor('--ui-primary', '#f97316'),
    cursorColor: themeColor('--ui-text-highlighted', '#fafafa'),
    cursorWidth: 2,
    plugins: [regions],
  })

  wavesurfer.on('loading', (percent) => {
    loadingPercent.value = percent
  })
  wavesurfer.on('ready', () => {
    ready.value = true
    renderMarkers()
  })
  wavesurfer.on('error', () => {
    failed.value = true
  })
  // A marker was dragged: report the new start, rounded to centiseconds like LRC.
  regions.on('region-updated', (region) => {
    emit('move', indexOf(region.id), Math.round(region.start * 100) / 100)
  })
  regions.on('region-clicked', (region, event) => {
    // Don't let the click also seek the waveform.
    event.stopPropagation()
    emit('select', indexOf(region.id))
  })
}

/** Removes the waveform; the shared audio element itself is left untouched. */
function destroy() {
  wavesurfer?.destroy()
  wavesurfer = null
  regions = null
}

onMounted(create)
onBeforeUnmount(destroy)

// Markers follow the rows (stamping, undo, nudges, drags) and the selection.
watch(markers, renderMarkers, { deep: true })
// The selected marker is drawn in a different color.
watch(() => props.selected, renderMarkers)
// The zoom slider: wavesurfer redraws at the new pixels-per-second.
watch(zoom, (value) => {
  if (ready.value) wavesurfer?.zoom(value)
})
</script>

<template>
  <div class="space-y-2">
    <div class="relative overflow-hidden rounded-lg border border-default bg-elevated/30 px-1 py-2">
      <div
        ref="container"
        data-testid="sync-timeline"
      />
      <div
        v-if="!ready && !failed"
        class="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-4 animate-spin"
        />
        Loading the detailed waveform… {{ loadingPercent }}%
      </div>
      <div
        v-if="failed"
        class="absolute inset-0 flex items-center justify-center gap-3 bg-default/80 text-sm text-muted"
      >
        The detailed waveform could not be loaded.
        <UButton
          label="Retry"
          size="xs"
          color="neutral"
          variant="subtle"
          @click="create"
        />
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-3 text-sm text-muted">
      <UIcon
        name="i-lucide-zoom-out"
        class="size-4"
      />
      <USlider
        v-model="zoom"
        :min="MIN_ZOOM"
        :max="MAX_ZOOM"
        :step="10"
        size="sm"
        class="w-40"
        aria-label="Waveform zoom"
      />
      <UIcon
        name="i-lucide-zoom-in"
        class="size-4"
      />
      <span class="ms-auto">Drag a marker to move the start of its line.</span>
    </div>
  </div>
</template>
