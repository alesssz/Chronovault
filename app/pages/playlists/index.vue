<script setup lang="ts">
/**
 * Playlists page (client-rendered): a grid of cards (cover or mosaic,
 * title, visibility, track count) and "New playlist". Groups of versions
 * made by "Share for feedback" are not here: they have the Versions page.
 */
// Browser tab title: "Playlists · Chronovault".
usePageTitle('Playlists')

// The cached list of curated playlists, and the "New playlist" dialog.
const { playlists, status, refresh, openCreateDialog } = usePlaylists()

// Track edits and deletions elsewhere change counts and mosaics.
onMounted(() => void refresh())
</script>

<template>
  <UContainer class="py-6 sm:py-8">
    <!-- Title and "New playlist" -->
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

    <!-- No playlists yet -->
    <UEmpty
      v-if="!playlists.length && status !== 'pending'"
      icon="i-lucide-list-music"
      title="No playlists yet"
      description="Create one here, or use “Add to playlist” in a track's menu."
      class="py-16"
    />

    <!-- Playlist cards -->
    <PlaylistGrid
      v-else
      :items="playlists"
    />
  </UContainer>
</template>
