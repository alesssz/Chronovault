<script setup lang="ts">
/**
 * Playlists page (client-rendered): a grid of cards (cover or mosaic,
 * title, visibility, track count) and "New playlist".
 */
import type { TrackVisibility } from '~~/shared/types/track'

useSeoMeta({ title: 'Playlists · ChronoPlayer' })

const { playlists, status, refresh, openCreateDialog } = usePlaylists()

// Track edits and deletions elsewhere change counts and mosaics.
onMounted(() => void refresh())

const visibilityIcon: Record<TrackVisibility, { icon: string, label: string }> = {
  private: { icon: 'i-lucide-lock', label: 'Private' },
  unlisted: { icon: 'i-lucide-link', label: 'Unlisted' },
  public: { icon: 'i-lucide-globe', label: 'Public' },
}

function trackCount(count: number) {
  return `${count} track${count === 1 ? '' : 's'}`
}
</script>

<template>
  <UContainer class="py-6 sm:py-8">
    <div class="mb-6 flex items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold tracking-tight">
        Playlists
      </h1>
      <UButton
        label="New playlist"
        icon="i-lucide-plus"
        data-testid="new-playlist"
        @click="openCreateDialog()"
      />
    </div>

    <UEmpty
      v-if="!playlists.length && status !== 'pending'"
      icon="i-lucide-list-music"
      title="No playlists yet"
      description="Create one here, or use “Add to playlist” in a track's menu."
      class="py-16"
    />

    <ul
      v-else
      class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
    >
      <li
        v-for="playlist in playlists"
        :key="playlist.id"
        data-testid="playlist-card"
      >
        <NuxtLink
          :to="`/playlists/${playlist.id}`"
          class="group block rounded-lg p-2 transition-colors hover:bg-elevated/60"
        >
          <PlaylistCover
            :url="playlist.coverUrl"
            :mosaic="playlist.mosaic"
            :title="playlist.title"
            rounded="rounded-lg"
            class="w-full shadow-lg shadow-black/20"
          />
          <p class="mt-2 truncate font-medium">
            {{ playlist.title }}
          </p>
          <p class="flex items-center gap-1.5 text-sm text-muted">
            <UIcon
              :name="visibilityIcon[playlist.visibility].icon"
              :aria-label="visibilityIcon[playlist.visibility].label"
              class="size-3.5 shrink-0"
            />
            <span class="truncate">
              {{ trackCount(playlist.trackCount) }}<span class="hidden sm:inline"> · {{ formatTime(playlist.durationSeconds) }}</span>
            </span>
          </p>
        </NuxtLink>
      </li>
    </ul>
  </UContainer>
</template>
