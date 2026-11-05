<script setup lang="ts">
/**
 * Below `md` (where the editors are one long column), a bar fixed at the
 * bottom of the screen, above the player bar, with "Unsaved changes" and
 * Save, shown while the form has something to save. The editors' own Save
 * sits in their header, out of reach once a long form is scrolled.
 *
 * Its height is `--save-bar-height` (main.css): the page leaves that much room
 * at its end, and bars pinned above the player bar (Stamp line) rise by it
 * while it is shown.
 */
defineProps<{
  /** There are unsaved changes: the bar is shown. */
  show: boolean
  /** Id of the form Save submits. */
  form: string
  /** The save is on its way (spinner on Save). */
  loading: boolean
}>()
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-x-0 bottom-(--above-player) z-20 flex h-(--save-bar-height) items-center justify-between gap-3 border-t border-default bg-default/95 px-4 backdrop-blur md:hidden"
    data-save-bar
    data-testid="save-bar"
  >
    <span class="text-sm text-muted">Unsaved changes</span>
    <UButton
      type="submit"
      :form="form"
      icon="i-lucide-save"
      label="Save"
      :loading="loading"
    />
  </div>
</template>
