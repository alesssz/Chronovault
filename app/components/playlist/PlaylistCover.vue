<script setup lang="ts">
import { FALLBACK_COVER } from '~~/shared/brand'
import { MOSAIC_SIZE } from '~~/shared/types/playlist'

/**
 * Playlist cover: the custom one when uploaded, otherwise a 2×2 mosaic of
 * the first track covers (or the first cover alone, when there are fewer).
 * A playlist with no cover at all (empty, or only tracks without one) shows
 * the Chronovault artwork, like a track without a cover (TrackCover).
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

/** The 4 mosaic tiles, only when there are enough covers for a full 2×2 grid. */
const tiles = computed(() => (props.mosaic.length >= MOSAIC_SIZE ? props.mosaic.slice(0, MOSAIC_SIZE) : []))
/** One image: the custom cover, or the first track cover when the mosaic is incomplete. */
const single = computed(() => props.url ?? (tiles.value.length ? null : props.mosaic[0] ?? null))
</script>

<template>
  <!-- No cover of its own and four track covers: the 2×2 mosaic -->
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
  <!-- Its own cover, or the first track cover when the mosaic is incomplete -->
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
  <!-- Nothing to show: the artwork (decorative there: empty alt; marked for the tests) -->
  <div
    v-else
    class="aspect-square shrink-0 overflow-hidden bg-elevated"
    :class="rounded"
  >
    <img
      :src="FALLBACK_COVER.app"
      alt=""
      loading="lazy"
      decoding="async"
      class="size-full object-cover"
      data-fallback-cover
    >
  </div>
</template>
