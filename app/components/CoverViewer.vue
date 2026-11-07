<script setup lang="ts">
/**
 * A cover on its own, full screen: the share page's cover opens it with a
 * click (or a tap), the Chronovault artwork for a track without one. The
 * image is as large as the screen allows, never past the stored size (covers
 * are saved at COVER_SIZE, 800px, see lib/image.ts; the artwork is 800px
 * too): stretched further it would only blur. Esc, the close button or a click
 * anywhere closes it.
 *
 * `title` and `description` are for screen readers (the dialog's name); the
 * view shows only the image and the close button.
 *
 * On opening, the view itself takes the focus (`tabindex="-1"`, see
 * onOpenAutoFocus), not the close button: focused, the button showed its
 * tooltip, and the first Esc closed the tooltip instead of the view.
 */
import { COVER_SIZE } from '~/lib/image'

defineProps<{
  /** The cover's address. */
  url: string
  /** The track's title: the dialog's name and the image's alt text. */
  title: string
}>()

/** Open or closed. */
const open = defineModel<boolean>('open', { default: false })

/** The view: it takes the focus on opening. */
const view = ref<HTMLElement | null>(null)

/** Focus the view rather than the first button (see the file comment). */
function onOpenAutoFocus(event: Event) {
  event.preventDefault()
  view.value?.focus()
}
</script>

<template>
  <UModal
    v-model:open="open"
    fullscreen
    :title="`Cover of ${title}`"
    description="Click anywhere or press Esc to close."
    :ui="{ content: 'bg-black/90 shadow-none ring-0' }"
    :content="{ onOpenAutoFocus }"
  >
    <template #content>
      <!-- A click anywhere, the image included, closes it: there is nothing else to do here -->
      <div
        ref="view"
        tabindex="-1"
        class="relative flex h-full cursor-zoom-out items-center justify-center p-4 outline-none sm:p-8"
        data-testid="cover-viewer"
        @click="open = false"
      >
        <img
          :src="url"
          :alt="`Cover of ${title}`"
          class="max-h-full max-w-full rounded-xl object-contain shadow-2xl shadow-black/60"
          :style="{ maxWidth: `min(100%, ${COVER_SIZE}px)`, maxHeight: `min(100%, ${COVER_SIZE}px)` }"
        >
        <IconButton
          icon="i-lucide-x"
          label="Close"
          color="neutral"
          variant="ghost"
          size="xl"
          class="absolute top-[max(env(safe-area-inset-top),1rem)] right-4 text-white hover:bg-white/10"
          data-testid="cover-viewer-close"
          @click.stop="open = false"
        />
      </div>
    </template>
  </UModal>
</template>
