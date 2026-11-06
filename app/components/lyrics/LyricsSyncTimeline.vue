<script setup lang="ts">
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import type { SyncRow } from '~~/shared/utils/lyrics'
import { getAudioEngine } from '~/lib/audio-engine'
import { waveformColors } from '~/lib/theme'

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

// Tells the editor about a drag (a marker moved) and a click (a marker selected).
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
  /** Its time, in seconds. */
  time: number
  /** Its text, shown in the marker's label. */
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

/** A label's widest (px), however far the next marker is. */
const LABEL_MAX_WIDTH = 240
/** Room left between a label and the next marker (px). */
const LABEL_GAP = 6

/**
 * Small label shown on a marker: number and the line, on a dark chip, cut with
 * an ellipsis to `maxWidth` (the room before the next marker). Its width is
 * its own (`max-content`): inside the marker's 2px-wide region it shrank to the
 * number, the rest of the text spilling out of the chip, white straight on the
 * waveform (invisible on the light theme's pale one) and over the next label.
 */
function markerLabel(marker: Marker, maxWidth: number): HTMLElement {
  // Rendered inside wavesurfer's shadow DOM: inline styles, no Tailwind classes.
  const label = document.createElement('div')
  label.dataset.testid = 'sync-marker'
  label.textContent = `${marker.number}. ${marker.text || '♪'}`
  label.title = label.textContent
  Object.assign(label.style, {
    width: 'max-content',
    maxWidth: `${maxWidth}px`,
    boxSizing: 'border-box',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: '11px',
    lineHeight: '1.3',
    padding: '1px 6px',
    marginLeft: '2px',
    borderRadius: '4px',
    background: 'rgba(0, 0, 0, 0.72)',
    color: '#fff',
    whiteSpace: 'nowrap',
    cursor: 'grab',
  })
  return label
}

/** Redraws every marker (cheap: a few dozen regions). The selected one is highlighted. */
function renderMarkers() {
  if (!regions || !wavesurfer || !ready.value) return
  regions.clearRegions()
  // Markers use the progress color; the selected one the cursor's.
  const { progressColor: accent, cursorColor: highlight } = waveformColors()
  // How many pixels a second of audio spans now (the zoom, or the width when the track fits).
  const duration = wavesurfer.getDuration()
  const pxPerSecond = duration > 0 ? wavesurfer.getWrapper().scrollWidth / duration : zoom.value
  // Every start, in order: each label may run up to the next one.
  const starts = markers.value.map(m => m.time).sort((a, b) => a - b)
  for (const marker of markers.value) {
    // The next start after this one (the end of the track for the last).
    const next = starts.find(time => time > marker.time) ?? duration
    const room = Math.min(LABEL_MAX_WIDTH, (next - marker.time) * pxPerSecond - LABEL_GAP)
    regions.addRegion({
      id: `line-${marker.index}`,
      start: marker.time,
      drag: true,
      resize: false,
      color: marker.index === props.selected ? highlight : accent,
      // At least the number stays readable, even with two markers almost together.
      content: markerLabel(marker, Math.max(28, room)),
    })
  }
}

/** Region id (`line-<index>`) → row index. */
function indexOf(regionId: string): number {
  return Number(regionId.replace('line-', ''))
}

/** Builds the waveform on the shared audio element (rebuilt from scratch every time). */
function create() {
  // The app's single <audio>: the timeline follows the same playback.
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
    ...waveformColors(),
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
  // A new zoom changes the room between markers: the labels are cut again to fit.
  wavesurfer.on('zoom', renderMarkers)
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

// Built once on screen, destroyed when the editor goes.
onMounted(create)
// Nothing left behind on the shared <audio> when the editor goes.
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
    <!-- The detailed waveform with a marker per synced line, and its loading and error states over it -->
    <div class="relative overflow-hidden rounded-lg border border-default bg-elevated/30 px-1 py-2">
      <!-- wavesurfer.js draws here -->
      <div
        ref="container"
        data-testid="sync-timeline"
      />
      <!-- Decoding the whole file (it can take a few seconds) -->
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
      <!-- Decoding failed: try again -->
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
    <!-- Zoom, and how to use the markers -->
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
