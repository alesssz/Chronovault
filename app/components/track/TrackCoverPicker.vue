<script setup lang="ts">
/**
 * Cover preview with "Add/Change cover" and "Remove" buttons. A picked image
 * first goes through the crop editor (CoverCropDialog); the component then
 * emits the file with the chosen crop (`select`) or asks for removal
 * (`remove`): the page converts, uploads and saves. `busy` shows a spinner
 * over the preview. The `preview` slot replaces the image (playlists show
 * their mosaic).
 */
import type { CropRect } from '~/lib/image'

defineProps<{
  url: string | null
  title: string
  busy?: boolean
}>()

const emit = defineEmits<{
  /** An image and the square to keep from it (source pixels). */
  select: [file: File, crop: CropRect]
  remove: []
}>()

/** The image waiting in the crop editor. */
const pending = ref<File | null>(null)
const cropOpen = ref(false)

function onCropConfirm(crop: CropRect) {
  if (pending.value) emit('select', pending.value, crop)
}

const input = ref<HTMLInputElement | null>(null)

function onChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  // Reset the input, so picking the same file again still fires `change`.
  target.value = ''
  if (!file) return
  pending.value = file
  cropOpen.value = true
}
</script>

<template>
  <div class="space-y-3">
    <div class="relative">
      <!-- The preview can be replaced, e.g. by a playlist's mosaic. -->
      <slot name="preview">
        <TrackCover
          :url="url"
          :title="title"
          rounded="rounded-lg"
          class="w-full"
        />
      </slot>
      <div
        v-if="busy"
        class="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-8 animate-spin text-white"
        />
      </div>
    </div>
    <input
      ref="input"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      class="hidden"
      data-testid="cover-input"
      @change="onChange"
    >
    <div class="flex gap-2">
      <UButton
        :label="url ? 'Change cover' : 'Add cover'"
        icon="i-lucide-image-up"
        color="neutral"
        variant="subtle"
        class="flex-1 justify-center"
        :disabled="busy"
        @click="input?.click()"
      />
      <UButton
        v-if="url"
        icon="i-lucide-trash-2"
        color="neutral"
        variant="ghost"
        aria-label="Remove cover"
        :disabled="busy"
        @click="emit('remove')"
      />
    </div>
    <p class="text-xs text-muted">
      You choose the square to keep; saved at up to 800×800.
    </p>

    <!-- Every picked image is cropped here before the page uploads it. -->
    <CoverCropDialog
      v-model:open="cropOpen"
      :file="pending"
      @confirm="onCropConfirm"
    />
  </div>
</template>
