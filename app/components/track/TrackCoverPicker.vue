<script setup lang="ts">
/**
 * Cover preview with "Add/Change cover" and "Remove" buttons. A picked image
 * first goes through the crop editor (CoverCropDialog); the component then
 * emits the file with the chosen crop (`select`) or asks for removal
 * (`remove`): the page converts, uploads and saves. `busy` shows a spinner
 * over the preview. The `preview` slot replaces the image (playlists show
 * their mosaic); the default slot adds a note under the picker's own.
 *
 * From `md` it fills the editors' side column, the preview at full width. Below
 * `md` the editors are one column and it is a compact row at their top: a
 * small preview with the buttons beside it, so the form is not a whole screen
 * of cover away.
 */
import type { CropRect } from '~/lib/image'

defineProps<{
  url: string | null
  title: string
  busy?: boolean
}>()

// The picked image with its crop, or a request to remove the cover.
const emit = defineEmits<{
  /** An image and the square to keep from it (source pixels). */
  select: [file: File, crop: CropRect]
  remove: []
}>()

/** The image waiting in the crop editor. */
const pending = ref<File | null>(null)
/** The crop editor is open. */
const cropOpen = ref(false)

/** The user chose the square: hand file and crop to the page. */
function onCropConfirm(crop: CropRect) {
  if (pending.value) emit('select', pending.value, crop)
}

/** Hidden file input, opened by the "Add/Change cover" button. */
const input = ref<HTMLInputElement | null>(null)

/** A file was picked: open the crop editor with it. */
function onChange(event: Event) {
  // The hidden file input.
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
  <div class="flex items-center gap-4 md:block md:space-y-3">
    <div class="relative size-24 shrink-0 md:size-auto">
      <!-- The preview can be replaced, e.g. by a playlist's mosaic. -->
      <slot name="preview">
        <TrackCover
          :url="url"
          :title="title"
          rounded="rounded-lg"
          class="w-full"
        />
      </slot>
      <!-- Saving: a spinner over the preview -->
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
    <!-- The system file picker, opened by the button below -->
    <input
      ref="input"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      class="hidden"
      data-testid="cover-input"
      @change="onChange"
    >
    <!-- Beside the preview below `md`, under it from `md` -->
    <div class="min-w-0 flex-1 space-y-2 md:space-y-3">
      <!-- Add or change the cover; remove it -->
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
        <IconButton
          v-if="url"
          icon="i-lucide-trash-2"
          color="neutral"
          variant="ghost"
          label="Remove cover"
          :disabled="busy"
          @click="emit('remove')"
        />
      </div>
      <!-- What happens to the picked image -->
      <p class="text-xs text-muted">
        You choose the square to keep; saved at up to 800×800.
      </p>
      <!-- A note of the page's own (a playlist's mosaic) -->
      <slot />
    </div>

    <!-- Every picked image is cropped here before the page uploads it. -->
    <CoverCropDialog
      v-model:open="cropOpen"
      :file="pending"
      @confirm="onCropConfirm"
    />
  </div>
</template>
