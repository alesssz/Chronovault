<script setup lang="ts">
import {
  MAX_CROP_ZOOM,
  clampCropView,
  cropRectOf,
  cropSide,
  initialCropView,
  type CropRect,
  type CropView,
} from '~/lib/image'

/**
 * Crop editor for a cover picked by the user (tracks and playlists).
 *
 * The image fills a square frame; what the frame shows is what the cover
 * will be. Drag (mouse or finger) to move the image, zoom with the slider,
 * the mouse wheel or a two-finger pinch. Keyboard: arrows move, + / − zoom
 * (Shift for bigger steps). It starts on the centered square, i.e. what the
 * automatic cropping would pick, so "Use cover" right away keeps that.
 *
 * The state is a CropView in source pixels (screen independent); on confirm
 * it emits the CropRect to cut, and the page converts and uploads.
 */
const props = defineProps<{
  /** The image to crop; the dialog shows it while open. */
  file: File | null
}>()

/** `v-model:open`: the parent opens the editor when an image is picked. */
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ confirm: [crop: CropRect] }>()

// The Android back button cancels the crop, like Cancel.
useCloseOnBack(open, () => {
  open.value = false
})

// --- The image ---------------------------------------------------------------------------
/** Object URL of the file, revoked when the file changes or the dialog goes away. */
const src = ref<string | null>(null)
/** Natural size of the image (0 until loaded). */
const natural = reactive({ width: 0, height: 0 })
/** The browser cannot decode the file (e.g. a format it does not support). */
const unreadable = ref(false)

// A new file: new object URL (the old one is released) and a fresh start.
watch(() => props.file, (file) => {
  if (src.value) URL.revokeObjectURL(src.value)
  src.value = file ? URL.createObjectURL(file) : null
  natural.width = 0
  natural.height = 0
  unreadable.value = false
}, { immediate: true })

onBeforeUnmount(() => {
  if (src.value) URL.revokeObjectURL(src.value)
})

/** The image is decoded: geometry can be computed and "Use cover" enabled. */
const ready = computed(() => natural.width > 0 && natural.height > 0)

/** Image decoded: read its natural size and start on the centered square. */
function onImageLoad(event: Event) {
  const img = event.target as HTMLImageElement
  natural.width = img.naturalWidth
  natural.height = img.naturalHeight
  view.value = initialCropView(natural.width, natural.height)
}

// --- View and geometry -------------------------------------------------------------------
const view = ref<CropView>({ zoom: 1, cx: 0, cy: 0 })

/** Applies a change, always keeping the square inside the image. */
function setView(next: CropView) {
  if (ready.value) view.value = clampCropView(next, natural.width, natural.height)
}

/** The square frame on screen, and its width in CSS pixels. */
const frame = ref<HTMLElement | null>(null)
const { width: frameWidth } = useElementSize(frame)

/** Screen pixels per source pixel at the current zoom. */
const scale = computed(() => (ready.value ? frameWidth.value / cropSide(natural.width, natural.height, view.value.zoom) : 0))

/** Size and position of the image inside the frame, so the square's center sits in the middle. */
const imageStyle = computed(() => ({
  width: `${natural.width * scale.value}px`,
  height: `${natural.height * scale.value}px`,
  transform: `translate(${frameWidth.value / 2 - view.value.cx * scale.value}px, ${frameWidth.value / 2 - view.value.cy * scale.value}px)`,
}))

/** Zoom as a slider value (the slider works on numbers, the view on objects). */
const zoom = computed({
  get: () => view.value.zoom,
  set: (value: number) => setView({ ...view.value, zoom: value }),
})

/** Moves the image by a screen distance (dragging right moves the picture right). */
function moveBy(dx: number, dy: number) {
  if (!scale.value) return
  setView({ ...view.value, cx: view.value.cx - dx / scale.value, cy: view.value.cy - dy / scale.value })
}

/** Multiplies the zoom (>1 zooms in), keeping the same center. */
function zoomBy(factor: number) {
  setView({ ...view.value, zoom: view.value.zoom * factor })
}

// --- Pointer: drag with one pointer, pinch with two -------------------------------------------
const pointers = new Map<number, { x: number, y: number }>()
/** A pointer is down: the cursor shows "grabbing". */
const dragging = ref(false)

/** Distance between the two active pointers (pinch), 0 with fewer. */
function distance(): number {
  const [a, b] = [...pointers.values()]
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
}

/**
 * A finger or the mouse goes down: track it. Capturing the pointer keeps
 * the moves coming even when it leaves the frame while dragging.
 */
function onPointerDown(event: PointerEvent) {
  if (!ready.value) return
  frame.value?.setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  dragging.value = true
}

/** One pointer drags the image; two pointers pinch to zoom. */
function onPointerMove(event: PointerEvent) {
  const previous = pointers.get(event.pointerId)
  if (!previous) return
  if (pointers.size === 1) {
    moveBy(event.clientX - previous.x, event.clientY - previous.y)
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    return
  }
  // Two fingers: the zoom follows the change of distance between them.
  const before = distance()
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  const after = distance()
  if (before > 0 && after > 0) zoomBy(after / before)
}

/** Pointer released or cancelled (e.g. the browser took over the gesture). */
function onPointerUp(event: PointerEvent) {
  pointers.delete(event.pointerId)
  dragging.value = pointers.size > 0
}

/** Mouse wheel / trackpad: smooth, proportional zoom. */
function onWheel(event: WheelEvent) {
  if (ready.value) zoomBy(Math.exp(-event.deltaY * 0.0015))
}

// --- Keyboard ----------------------------------------------------------------------------
function onKeydown(event: KeyboardEvent) {
  // A step is 5% of the frame (20% with Shift).
  const step = frameWidth.value * (event.shiftKey ? 0.2 : 0.05)
  // Arrow key → how far the picture moves (dx, dy in screen pixels).
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  }
  const move = moves[event.key]
  if (move) moveBy(...move)
  else if (event.key === '+' || event.key === '=') zoomBy(event.shiftKey ? 1.25 : 1.1)
  else if (event.key === '-' || event.key === '_') zoomBy(event.shiftKey ? 0.8 : 1 / 1.1)
  else return
  event.preventDefault()
}

// --- Actions -----------------------------------------------------------------------------
function reset() {
  if (ready.value) view.value = initialCropView(natural.width, natural.height)
}

/** "Use cover": hand the chosen square to the parent and close. */
function confirm() {
  if (!ready.value) return
  emit('confirm', cropRectOf(view.value, natural.width, natural.height))
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Crop the cover"
    description="Drag to move · scroll, pinch or use the slider to zoom."
  >
    <template #body>
      <div class="space-y-4">
        <!--
          The frame: exactly what the cover will show. Its width also follows
          the window height (17rem = header, slider and footer), so the zoom
          slider and the buttons stay on screen without scrolling.
        -->
        <div
          ref="frame"
          class="relative mx-auto aspect-square w-full max-w-[min(24rem,calc(100dvh-17rem))] touch-none select-none overflow-hidden rounded-lg bg-elevated outline-none focus-visible:ring-2 focus-visible:ring-primary"
          :class="dragging ? 'cursor-grabbing' : 'cursor-grab'"
          tabindex="0"
          role="application"
          aria-label="Cover crop area: arrows move the image, plus and minus zoom"
          data-testid="crop-frame"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @wheel.prevent="onWheel"
          @keydown="onKeydown"
        >
          <img
            v-if="src"
            :src="src"
            alt=""
            draggable="false"
            class="pointer-events-none absolute top-0 left-0 max-w-none origin-top-left"
            :class="{ invisible: !ready }"
            :style="imageStyle"
            @load="onImageLoad"
            @error="unreadable = true"
          >
          <!-- Rule-of-thirds grid, to place the subject. -->
          <div
            v-if="ready"
            class="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3"
            aria-hidden="true"
          >
            <span
              v-for="cell in 9"
              :key="cell"
              class="border-white/25"
              :class="{ 'border-r': cell % 3 !== 0, 'border-b': cell <= 6 }"
            />
          </div>
          <div
            v-if="!ready && !unreadable"
            class="absolute inset-0 flex items-center justify-center"
          >
            <UIcon
              name="i-lucide-loader-circle"
              class="size-6 animate-spin text-muted"
            />
          </div>
        </div>

        <UAlert
          v-if="unreadable"
          color="error"
          variant="subtle"
          icon="i-lucide-image-off"
          title="This image cannot be opened"
          description="Use a JPEG, PNG or WebP image."
        />

        <div class="flex items-center gap-3">
          <UIcon
            name="i-lucide-zoom-out"
            class="size-4 shrink-0 text-muted"
          />
          <USlider
            v-model="zoom"
            :min="1"
            :max="MAX_CROP_ZOOM"
            :step="0.01"
            :disabled="!ready"
            aria-label="Zoom"
            class="flex-1"
            data-testid="crop-zoom"
          />
          <UIcon
            name="i-lucide-zoom-in"
            class="size-4 shrink-0 text-muted"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <!-- Icon only on phones: the three buttons must fit on one line. -->
        <UButton
          icon="i-lucide-rotate-ccw"
          color="neutral"
          variant="ghost"
          aria-label="Reset"
          :disabled="!ready"
          @click="reset"
        >
          <span class="hidden sm:inline">Reset</span>
        </UButton>
        <div class="flex gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            @click="open = false"
          />
          <UButton
            label="Use cover"
            icon="i-lucide-check"
            :disabled="!ready"
            data-testid="crop-confirm"
            @click="confirm"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
