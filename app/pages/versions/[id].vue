<script setup lang="ts">
/**
 * Page of a group of versions (client-rendered, owner only): the versions of
 * a song sent for feedback, their link, the friends' votes, plays and
 * comments, and "Mark as final" on the chosen one (which closes the voting).
 * Everything happens in PlaylistEditor, shared with the playlist page.
 */
const route = useRoute()
</script>

<template>
  <PlaylistEditor
    :id="String(route.params.id)"
    purpose="versions"
  />
</template>
