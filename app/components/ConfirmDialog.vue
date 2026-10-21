<script setup lang="ts">
/**
 * Confirmation dialog for destructive actions (delete a track or playlist).
 * `v-model:open` controls it; `confirm` fires on the red button. While
 * `loading`, it cannot be dismissed and the buttons are disabled.
 */
withDefaults(defineProps<{
  title: string
  description?: string
  confirmLabel?: string
  loading?: boolean
}>(), {
  description: undefined,
  confirmLabel: 'Confirm',
  loading: false,
})

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ confirm: [] }>()
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :description="description"
    :dismissible="!loading"
  >
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="loading"
          @click="open = false"
        />
        <UButton
          :label="confirmLabel"
          color="error"
          :loading="loading"
          @click="emit('confirm')"
        />
      </div>
    </template>
  </UModal>
</template>
