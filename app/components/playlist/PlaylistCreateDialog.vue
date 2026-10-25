<script setup lang="ts">
import { playlistMetadataSchema } from '~~/shared/schemas/playlist'

/** "New playlist" dialog, opened through usePlaylists().openCreateDialog(). */
const { createDialog, createPlaylist } = usePlaylists()
// "Playlist created" / failure messages.
const toast = useToast()

/** The title being typed. */
const title = ref('')
/** The create request (dialog locked while it runs). */
const saving = useAsyncTask()
/** Validation message under the field. */
const titleError = ref<string | null>(null)

/** Open state lives in shared state (usePlaylists); closing is refused while saving. */
const open = computed({
  get: () => createDialog.value.open,
  set: (value) => {
    if (!saving.running) createDialog.value = { ...createDialog.value, open: value }
  },
})

// The Android back button cancels (the setter above refuses while saving).
useCloseOnBack(open, () => {
  open.value = false
})

// Each opening starts from an empty field.
watch(open, (value) => {
  if (value) {
    title.value = ''
    titleError.value = null
  }
})

/** Validates the title, creates the playlist (with the selected track, if any) and opens it. */
async function onSubmit() {
  // The title checked with the shared schema (empty or too long: an error on the field).
  const parsed = playlistMetadataSchema.shape.title.safeParse(title.value)
  if (!parsed.success) {
    titleError.value = parsed.error.issues[0]?.message ?? 'Invalid title'
    return
  }
  await saving.run(async () => {
    // The new playlist, cached in the list.
    const created = await createPlaylist(parsed.data, createDialog.value.trackIds)
    createDialog.value = { open: false, trackIds: [] }
    toast.add({ title: `Playlist "${created.title}" created`, icon: 'i-lucide-list-music', color: 'success' })
    await navigateTo(`/playlists/${created.id}`)
  }, 'Playlist not created')
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="New playlist"
    :description="createDialog.trackIds.length
      ? `It will start with the selected track${createDialog.trackIds.length > 1 ? 's' : ''}.`
      : 'You can add tracks from the library.'"
    :dismissible="!saving.running"
  >
    <!-- The title, checked on submit (Enter or the Create button) -->
    <template #body>
      <form
        id="playlist-create-form"
        @submit.prevent="onSubmit"
      >
        <UFormField
          label="Title"
          :error="titleError ?? undefined"
          required
        >
          <UInput
            v-model="title"
            autofocus
            placeholder="e.g. Night drive"
            class="w-full"
            data-testid="playlist-create-title"
          />
        </UFormField>
      </form>
    </template>
    <!-- Cancel, and Create (it submits the form above through its id) -->
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="saving.running"
          @click="open = false"
        />
        <UButton
          type="submit"
          form="playlist-create-form"
          label="Create"
          icon="i-lucide-plus"
          :loading="saving.running"
          data-testid="playlist-create-submit"
        />
      </div>
    </template>
  </UModal>
</template>
