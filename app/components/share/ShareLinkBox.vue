<script setup lang="ts">
import type { ShareKind } from '~/composables/useShareLink'

/**
 * "Sharing" box of the track editor and the playlist page: for an unlisted
 * or public item, what visitors get, "Copy share link" and a button that
 * opens the public page; for a private one, how to get a link.
 * `shared` must reflect the *saved* visibility: a change applies once saved.
 * The default slot adds notes under the description (e.g. the playlist's
 * warning about the private tracks it contains).
 */
const props = defineProps<{
  /** Track or playlist id. */
  id: string
  kind: ShareKind
  /** The saved visibility is unlisted or public. */
  shared: boolean
}>()

const { shareUrl, copyShareLink } = useShareLink()

/** What a visitor can do with the link. */
const reach = computed(() => (props.kind === 'playlist'
  ? 'Anyone with the link can listen to every track in this playlist, without an account.'
  : 'Anyone with the link can listen, without an account.'))
</script>

<template>
  <div
    class="space-y-2"
    data-testid="share-box"
  >
    <h2 class="text-xs font-semibold uppercase tracking-widest text-muted">
      Sharing
    </h2>
    <template v-if="shared">
      <p class="text-sm text-muted">
        {{ reach }} The Suno prompt and the mastering status are never shown.
      </p>
      <slot />
      <!-- Copy the link, or open the public page in a new tab -->
      <UFieldGroup class="w-full">
        <UButton
          label="Copy share link"
          icon="i-lucide-link"
          color="neutral"
          variant="subtle"
          block
          data-testid="copy-share-link"
          @click="copyShareLink(id, kind)"
        />
        <UButton
          :to="shareUrl(id, kind)"
          target="_blank"
          icon="i-lucide-external-link"
          color="neutral"
          variant="subtle"
          aria-label="Open share page"
        />
      </UFieldGroup>
    </template>
    <p
      v-else
      class="text-sm text-muted"
    >
      Private: only you can listen. Set the visibility to Unlisted or Public and save to get a share link.
    </p>
  </div>
</template>
