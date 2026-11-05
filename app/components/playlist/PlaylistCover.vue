<script setup lang="ts">
import { FALLBACK_COVER } from '~~/shared/brand'
import { MOSAIC_SIZE } from '~~/shared/types/playlist'

/**
 * Playlist cover: the custom one when uploaded, otherwise a 2×2 mosaic of
 * the first track covers (or the first cover alone, when there are fewer).
 * A playlist with no cover at all (empty, or only tracks without one) shows
 * the Chronovault artwork, like a track without a cover (TrackCover), with the
 * playlist's initials over it ("RT" for "Road trip"): a grid of such
 * playlists was the same image repeated, told apart only by the titles.
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
/** Over the artwork: "RT" for "Road trip" ('' without a title). */
const titleInitials = computed(() => initials(props.title))
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
    <!--
      No cover of its own and four track covers: the 2×2 mosaic. The comments of the three
      branches stay inside them: between the branches, at the root, the server renderer counted
      them as root nodes and dropped the classes a page gives the cover (a share page's sizes),
      and hydration does not restore them.
    -->
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
    <!-- Its own cover, or the first track cover when the mosaic is incomplete -->
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
    class="@container relative aspect-square shrink-0 overflow-hidden bg-elevated"
    :class="rounded"
  >
    <!--
      Nothing to show: the artwork (decorative there: empty alt; marked for the tests), blurred
      and dimmed under the playlist's initials in the brand's Cinzel (sharp, the artwork's own
      "CHRONOVAULT" showed in pieces around the letters), sized from the cover's own width
      (`cqi`) so they fill a grid card and a share page's cover alike. Decorative too: the title
      is always written beside or under the cover.
    -->
    <img
      :src="FALLBACK_COVER.app"
      alt=""
      loading="lazy"
      decoding="async"
      class="size-full object-cover"
      :class="{ 'scale-110 blur-[3cqi]': titleInitials }"
      data-fallback-cover
    >
    <span
      v-if="titleInitials"
      aria-hidden="true"
      class="absolute inset-0 flex items-center justify-center bg-black/45 font-display text-[length:34cqi] leading-none font-semibold text-white [text-shadow:0_0.05em_0.2em_rgb(0_0_0/0.6)]"
      data-testid="playlist-initials"
    >{{ titleInitials }}</span>
  </div>
</template>
