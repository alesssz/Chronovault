<script setup lang="ts">
/**
 * The light/dark switch (Nuxt UI's UColorModeButton) with a tooltip, like
 * every other icon-only button (see IconButton). The tooltip says what a
 * click does, with the same words as the button's own aria-label; it opens
 * where IconButton's do (above, or below without room above).
 */
const colorMode = useColorMode()

/** What a click does now. */
const label = computed(() => (colorMode.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'))
</script>

<template>
  <UTooltip
    :text="label"
    :content="{ side: 'top' }"
  >
    <UColorModeButton />
  </UTooltip>
</template>
