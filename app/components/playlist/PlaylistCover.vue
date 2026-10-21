<script setup lang="ts">
import { MOSAIC_SIZE } from '~~/shared/types/playlist'

/**
 * Playlist cover: the custom one when uploaded, otherwise a 2×2 mosaic of
 * the first track covers (or the first cover alone, when there are fewer).
 */
const props = withDefaults(defineProps<{
  url: string | null | undefined
  mosaic: string[]
  title?: string
  rounded?: string
}>(), {
  title: '',
  rounded: 'rounded-md',
})

const tiles = computed(() => (props.mosaic.length >= MOSAIC_SIZE ? props.mosaic.slice(0, MOSAIC_SIZE) : []))
const single = computed(() => props.url ?? (tiles.value.length ? null : props.mosaic[0] ?? null))
</script>

<template>
  <div
    v-if="!url && tiles.length"
    class="grid aspect-square shrink-0 grid-cols-2 overflow-hidden bg-elevated"
    :class="rounded"
    role="img"
    :aria-label="title ? `Cover of ${title}` : 'Cover'"
    data-testid="playlist-mosaic"
  >
    <img
      v-for="(src, i) in tiles"
      :key="i"
      :src="src"
      alt=""
      loading="lazy"
      decoding="async"
      class="size-full object-cover"
    >
  </div>
  <div
    v-else-if="single"
    class="aspect-square shrink-0 overflow-hidden bg-elevated"
    :class="rounded"
  >
    <img
      :src="single"
      :alt="title ? `Cover of ${title}` : 'Cover'"
      loading="lazy"
      decoding="async"
      class="size-full object-cover"
    >
  </div>
  <div
    v-else
    class="flex aspect-square shrink-0 items-center justify-center bg-gradient-to-br from-primary/25 via-elevated to-accented"
    :class="rounded"
  >
    <UIcon
      name="i-lucide-list-music"
      class="size-2/5 text-muted"
    />
  </div>
</template>
