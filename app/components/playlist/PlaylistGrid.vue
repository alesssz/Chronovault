<script setup lang="ts">
import type { PlaylistSummary } from '~~/shared/types/playlist'

/**
 * Grid of playlist cards (Playlists page) or group cards (Versions page):
 * cover or mosaic, title, visibility icon, track count and duration. Each
 * card opens the item's page (/playlists/:id or /versions/:id, by its purpose).
 * A group with feedback the owner has not seen yet gets a "new" badge on its
 * cover (`unseen`).
 */
withDefaults(defineProps<{
  /** The cards to show, in order (the lists come newest first from the API). */
  items: PlaylistSummary[]
  /** Unseen votes per item id (Versions page); items without any show no badge. */
  unseen?: Record<string, number>
}>(), { unseen: () => ({}) })
</script>

<template>
  <!-- 2 columns on phones, up to 5 on wide screens -->
  <ul class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
    <!-- One card per item; the whole card is the link -->
    <li
      v-for="playlist in items"
      :key="playlist.id"
      data-testid="playlist-card"
    >
      <NuxtLink
        :to="playlistPath(playlist)"
        class="group block rounded-lg p-2 transition-colors hover:bg-elevated/60"
      >
        <!-- Custom cover, or the mosaic of the first track covers; "N new" on top when friends voted -->
        <div class="relative">
          <PlaylistCover
            :url="playlist.coverUrl"
            :mosaic="playlist.mosaic"
            :title="playlist.title"
            rounded="rounded-lg"
            class="w-full shadow-lg shadow-black/20"
          />
          <UBadge
            v-if="unseen[playlist.id]"
            :label="`${unseen[playlist.id]} new`"
            color="primary"
            variant="solid"
            size="sm"
            class="absolute top-2 right-2 shadow"
            data-testid="playlist-card-new"
          />
        </div>
        <!-- Title -->
        <p class="mt-2 truncate font-medium">
          {{ playlist.title }}
        </p>
        <!-- Visibility icon, count and duration -->
        <p class="flex items-center gap-1.5 text-sm text-muted">
          <UIcon
            :name="VISIBILITY_INFO[playlist.visibility].icon"
            :aria-label="VISIBILITY_INFO[playlist.visibility].label"
            class="size-3.5 shrink-0"
          />
          <!-- "3 tracks · 12:40", or "3 versions · 12:40" for a group -->
          <span class="truncate">
            {{ pluralize(playlist.trackCount, PLAYLIST_PURPOSE_INFO[playlist.purpose].trackNoun) }}<span class="hidden sm:inline"> · {{ formatTime(playlist.durationSeconds) }}</span>
          </span>
        </p>
      </NuxtLink>
    </li>
  </ul>
</template>
