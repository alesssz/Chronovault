<script setup lang="ts">
/**
 * Error page for fatal errors, e.g. a missing track or playlist
 * (`createError({ fatal: true })`) or an unknown route.
 */
import type { NuxtError } from '#app'

defineProps<{ error: NuxtError }>()
</script>

<template>
  <UApp>
    <UError
      :error="error"
      :clear="{ label: 'Back to library', to: '/' }"
    />
  </UApp>
</template>
