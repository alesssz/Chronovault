<script setup lang="ts">
/**
 * Layout of the signed-in app: header, page content and the player.
 * `has-player` adds bottom padding while the player bar is visible, so it
 * never covers the end of the page (see main.css).
 */
const player = usePlayerStore()
</script>

<template>
  <div
    class="flex min-h-dvh flex-col"
    :class="{ 'has-player': player.isActive }"
  >
    <AppHeader />

    <UMain class="flex-1">
      <slot />
    </UMain>

    <!-- In the layout, not in pages: this way playback survives navigation. -->
    <PlayerBar v-if="player.isActive" />
    <PlayerExpanded />
    <PlayerQueue />
    <!-- Global dialog: "New playlist" can be opened from any page (usePlaylists). -->
    <PlaylistCreateDialog />
  </div>
</template>
