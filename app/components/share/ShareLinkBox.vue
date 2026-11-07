<script setup lang="ts">
import type { PlaylistPurpose } from '~~/shared/types/playlist'
import type { ShareKind } from '~/composables/useShareLink'

/**
 * "Sharing" box of the track editor and the playlist page: for an unlisted
 * or public item, what visitors get, "Copy share link" and a button that
 * opens the public page; for a private one, how to get a link. What
 * visitors get is a playlist's only: a track's visibility cards, in the same
 * editor, already say it (who can listen, who can download), and the box
 * repeated their words; for a track it keeps only what the cards do not say. On touch
 * screens the first button is "Share link" instead and opens the device's
 * share sheet (useShareLink decides).
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
  /** Name of the track or playlist, given to the share sheet along with the link. */
  title?: string
  /** A playlist's purpose, for its words: "every version in this group" for a group of versions (default: a playlist). */
  purpose?: PlaylistPurpose
}>()

// The link, the share action, and whether it opens the device's share sheet.
const { shareUrl, shareLink, nativeShare } = useShareLink()

/**
 * What a visitor can do with the link: for a playlist, every track, each
 * downloadable per its own visibility (unlisted and private ones yes, public
 * ones never); for a track, its visibility cards say it, so nothing here.
 */
const reach = computed(() => {
  if (props.kind !== 'playlist') return ''
  // In the purpose's words: a group's box spoke of "every track in this playlist" (UI-40).
  const { noun, trackNoun } = PLAYLIST_PURPOSE_INFO[props.purpose ?? 'playlist']
  return `Anyone with the link can listen to every ${trackNoun} in this ${noun}, without an account, and download those that are not public. `
})
</script>

<template>
  <div
    class="space-y-2"
    data-testid="share-box"
  >
    <h2 class="text-xs font-semibold uppercase tracking-widest text-muted">
      Sharing
    </h2>
    <!-- Shared: who can open it, the page's own extra content (slot), then the link -->
    <template v-if="shared">
      <p class="text-sm text-muted">
        {{ reach }}The Suno prompt and the mastering status are never shown.
      </p>
      <slot />
      <!-- Share (touch screens) or copy the link, or open the public page in a new tab -->
      <UFieldGroup class="w-full">
        <UButton
          :label="nativeShare ? 'Share link' : 'Copy share link'"
          :icon="nativeShare ? 'i-lucide-share-2' : 'i-lucide-link'"
          color="neutral"
          variant="subtle"
          block
          data-testid="copy-share-link"
          @click="shareLink(id, kind, title)"
        />
        <IconButton
          :to="shareUrl(id, kind)"
          target="_blank"
          icon="i-lucide-external-link"
          color="neutral"
          variant="subtle"
          label="Open share page"
        />
      </UFieldGroup>
    </template>
    <!-- Private: how to get a link -->
    <p
      v-else
      class="text-sm text-muted"
    >
      Private: only you can listen. Set the visibility to Unlisted or Public and save to get a share link.
    </p>
  </div>
</template>
