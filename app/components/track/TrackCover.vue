<script setup lang="ts">
/**
 * Square track cover. A track without one shows the Chronovault artwork
 * (FALLBACK_COVER in shared/brand.ts), the same one the lock screen and link
 * previews show: every track looks like part of the same work, rather than an
 * empty grey tile.
 * The size comes from the parent (class), `rounded` from the prop.
 */
import { FALLBACK_COVER } from '~~/shared/brand'

withDefaults(defineProps<{
  url: string | null | undefined
  title?: string
  rounded?: string
}>(), {
  title: '',
  rounded: 'rounded-md',
})
</script>

<template>
  <div
    class="relative aspect-square shrink-0 overflow-hidden bg-elevated"
    :class="rounded"
  >
    <!-- The track's own cover, or the artwork (decorative there: empty alt; marked for the tests) -->
    <img
      :src="url || FALLBACK_COVER.app"
      :alt="url ? (title ? `Cover of ${title}` : 'Cover') : ''"
      loading="lazy"
      decoding="async"
      class="size-full object-cover"
      :data-fallback-cover="url ? undefined : ''"
    >
  </div>
</template>
