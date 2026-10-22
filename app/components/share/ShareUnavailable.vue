<script setup lang="ts">
import type { ShareKind } from '~/composables/useShareLink'

/**
 * What a share page shows instead of the item: "not available" for a
 * private, missing or malformed link (indistinguishable on purpose), or a
 * generic error when the item could not be loaded.
 */
const props = defineProps<{
  kind: ShareKind
  /** The link leads nowhere (otherwise: a loading failure). */
  notFound: boolean
}>()

/** "Track" / "Playlist", for the title. */
const label = computed(() => (props.kind === 'track' ? 'Track' : 'Playlist'))
</script>

<template>
  <UEmpty
    :icon="notFound ? 'i-lucide-link-2-off' : 'i-lucide-circle-alert'"
    :title="notFound ? `${label} not available` : 'Something went wrong'"
    :description="notFound
      ? `The link is wrong, or the owner made this ${kind} private.`
      : `The ${kind} could not be loaded. Try again in a moment.`"
    class="py-24"
    data-testid="shared-not-found"
  />
</template>
