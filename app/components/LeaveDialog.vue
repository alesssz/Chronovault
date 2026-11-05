<script setup lang="ts">
import type { LeaveAnswer, LeaveQuestion } from '~/composables/useLeaveConfirm'

/**
 * "Leave this page?" with unsaved work on it, opened by useLeaveConfirm (a
 * Nuxt UI overlay: `close` carries the answer). Stay, leave anyway, and in
 * an editor Save and leave. On phones the buttons stack, the main one on top.
 */
const props = defineProps<LeaveQuestion>()

/** `v-model:open`, driven by the overlay. */
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ close: [answer: LeaveAnswer] }>()

// The Android back button stays, like Stay.
useCloseOnBack(open, () => emit('close', 'stay'))
</script>

<template>
  <UModal
    v-model:open="open"
    :title="props.title"
    :description="props.description"
  >
    <template #footer>
      <div
        class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end"
        data-testid="leave-dialog"
      >
        <UButton
          label="Stay"
          color="neutral"
          variant="ghost"
          class="justify-center"
          @click="emit('close', 'stay')"
        />
        <UButton
          :label="props.leaveLabel"
          color="error"
          :variant="props.canSave ? 'subtle' : 'solid'"
          class="justify-center"
          @click="emit('close', 'leave')"
        />
        <UButton
          v-if="props.canSave"
          label="Save and leave"
          icon="i-lucide-save"
          class="justify-center"
          @click="emit('close', 'save')"
        />
      </div>
    </template>
  </UModal>
</template>
