<script setup lang="ts">
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
    <PlaylistCreateDialog />
  </div>
</template>
