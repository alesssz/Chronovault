<script setup lang="ts">
/**
 * Playlist page (client-rendered, owner only). Everything happens in
 * PlaylistEditor, shared with the page of a group of versions
 * (pages/versions/[id].vue).
 */
const route = useRoute()
</script>

<template>
  <PlaylistEditor
    :id="String(route.params.id)"
    purpose="playlist"
  />
</template>
