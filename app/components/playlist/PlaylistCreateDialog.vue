<script setup lang="ts">
import { playlistMetadataSchema } from '~~/shared/schemas/playlist'
import { getErrorMessage } from '~/utils/errors'

/** "New playlist" dialog, opened through usePlaylists().openCreateDialog(). */
const { createDialog, createPlaylist } = usePlaylists()
const toast = useToast()

const title = ref('')
const saving = ref(false)
const titleError = ref<string | null>(null)

const open = computed({
  get: () => createDialog.value.open,
  set: (value) => {
    if (!saving.value) createDialog.value = { ...createDialog.value, open: value }
  },
})

watch(open, (value) => {
  if (value) {
    title.value = ''
    titleError.value = null
  }
})

async function onSubmit() {
  const parsed = playlistMetadataSchema.shape.title.safeParse(title.value)
  if (!parsed.success) {
    titleError.value = parsed.error.issues[0]?.message ?? 'Invalid title'
    return
  }
  saving.value = true
  try {
    const created = await createPlaylist(parsed.data, createDialog.value.trackIds)
    createDialog.value = { open: false, trackIds: [] }
    toast.add({ title: `Playlist "${created.title}" created`, icon: 'i-lucide-list-music', color: 'success' })
    await navigateTo(`/playlists/${created.id}`)
  }
  catch (err) {
    toast.add({ title: 'Playlist not created', description: getErrorMessage(err), color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="New playlist"
    :description="createDialog.trackIds.length
      ? `It will start with the selected track${createDialog.trackIds.length > 1 ? 's' : ''}.`
      : 'You can add tracks from the library.'"
    :dismissible="!saving"
  >
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
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="saving"
          @click="open = false"
        />
        <UButton
          type="submit"
          form="playlist-create-form"
          label="Create"
          icon="i-lucide-plus"
          :loading="saving"
          data-testid="playlist-create-submit"
        />
      </div>
    </template>
  </UModal>
</template>
