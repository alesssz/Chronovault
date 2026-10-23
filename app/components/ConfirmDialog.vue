<script setup lang="ts">
/**
 * Confirmation dialog for destructive actions (delete a track or playlist).
 * `v-model:open` controls it; `confirm` fires on the red button. While
 * `loading`, it cannot be dismissed and the buttons are disabled.
 */
const props = withDefaults(defineProps<{
  title: string
  description?: string
  confirmLabel?: string
  loading?: boolean
}>(), {
  description: undefined,
  confirmLabel: 'Confirm',
  loading: false,
})

/** `v-model:open`. */
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ confirm: [] }>()

// The Android back button cancels, like Cancel; not while the action runs (the dialog is locked then).
useCloseOnBack(open, () => {
  if (!props.loading) open.value = false
})
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
