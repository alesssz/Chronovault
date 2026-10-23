<script setup lang="ts">
/**
 * "Up next" side panel: the track playing and the editable list of upcoming
 * tracks. Opened from the player bar or the full-screen view
 * (`player.setQueueOpen`); rendered once by the default layout.
 * The list is a separate component so drag and drop binds to it when the
 * panel opens (the panel's content only exists while it is open).
 */
const player = usePlayerStore()

/** The panel is bound to the store (opened from the bar or the full-screen view). */
const open = computed({
  get: () => player.queueOpen,
  set: value => player.setQueueOpen(value),
})

// The Android back button closes the panel first (it may sit on top of the full-screen view).
useCloseOnBack(open, () => {
  open.value = false
})
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Up next"
    description="Drag to reorder, or use each track's menu."
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <template #body>
      <PlayerQueueList />
    </template>
  </USlideover>
</template>
