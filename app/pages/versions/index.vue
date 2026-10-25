<script setup lang="ts">
/**
 * Versions page (client-rendered): the groups of versions made by
 * "Share for feedback" in the library (2-3 versions of a song, one link for
 * friends to pick the best), kept apart from the curated playlists. Groups
 * are only created from the library selection, so there is no "New" button.
 */
// Browser tab title: "Versions · Chronovault".
usePageTitle('Versions')

// The cached list of groups (shared with the group pages and "Share for feedback").
const { items: groups, status, refresh } = usePlaylistList('versions')
// Votes and comments since the owner's last visit to each group (the cards' "new" badges).
const { unseen, refresh: refreshUnseen } = useUnseenFeedback()

// Track edits and deletions elsewhere change counts and mosaics; friends may have voted.
onMounted(() => {
  void refresh()
  void refreshUnseen()
})
</script>

<template>
  <UContainer class="py-6 sm:py-8">
    <!-- Title and what the page holds -->
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">
        Versions
      </h1>
      <p class="mt-1 text-sm text-muted">
        Versions of a song shared together for feedback. Open a group to see what your friends picked, copy its link or mark the chosen one as final.
      </p>
    </div>

    <!-- No groups yet: how to make one -->
    <UEmpty
      v-if="!groups.length && status !== 'pending'"
      icon="i-lucide-layers"
      title="No versions shared yet"
      description="In the library, tap Select, tick the versions of a song and use “Share for feedback”."
      :actions="[{ label: 'Go to library', to: '/', icon: 'i-lucide-library' }]"
      class="py-16"
      data-testid="versions-empty"
    />

    <!-- Group cards, "N new" on those with feedback not seen yet -->
    <PlaylistGrid
      v-else
      :items="groups"
      :unseen="unseen.groups"
    />
  </UContainer>
</template>
