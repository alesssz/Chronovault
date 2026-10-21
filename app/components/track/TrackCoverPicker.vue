<script setup lang="ts">
defineProps<{
  url: string | null
  title: string
  busy?: boolean
}>()

const emit = defineEmits<{
  select: [file: File]
  remove: []
}>()

const input = ref<HTMLInputElement | null>(null)

function onChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (file) emit('select', file)
}
</script>

<template>
  <div class="space-y-3">
    <div class="relative">
      <!-- The preview can be replaced, e.g. by a playlist's mosaic. -->
      <slot name="preview">
        <TrackCover
          :url="url"
          :title="title"
          rounded="rounded-lg"
          class="w-full"
        />
      </slot>
      <div
        v-if="busy"
        class="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-8 animate-spin text-white"
        />
      </div>
    </div>
    <input
      ref="input"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      class="hidden"
      data-testid="cover-input"
      @change="onChange"
    >
    <div class="flex gap-2">
      <UButton
        :label="url ? 'Change cover' : 'Add cover'"
        icon="i-lucide-image-up"
        color="neutral"
        variant="subtle"
        class="flex-1 justify-center"
        :disabled="busy"
        @click="input?.click()"
      />
      <UButton
        v-if="url"
        icon="i-lucide-trash-2"
        color="neutral"
        variant="ghost"
        aria-label="Remove cover"
        :disabled="busy"
        @click="emit('remove')"
      />
    </div>
    <p class="text-xs text-muted">
      Center-cropped to a square, 800×800.
    </p>
  </div>
</template>
