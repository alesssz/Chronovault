<script setup lang="ts">
withDefaults(defineProps<{
  url: string | null | undefined
  title?: string
  rounded?: string
}>(), {
  title: '',
  rounded: 'rounded-md',
})
</script>

<template>
  <div
    class="relative aspect-square shrink-0 overflow-hidden bg-elevated"
    :class="rounded"
  >
    <img
      v-if="url"
      :src="url"
      :alt="title ? `Cover of ${title}` : 'Cover'"
      loading="lazy"
      decoding="async"
      class="size-full object-cover"
    >
    <div
      v-else
      class="flex size-full items-center justify-center bg-gradient-to-br from-primary/25 via-elevated to-accented"
    >
      <UIcon
        name="i-lucide-music"
        class="size-2/5 text-muted"
      />
    </div>
  </div>
</template>
