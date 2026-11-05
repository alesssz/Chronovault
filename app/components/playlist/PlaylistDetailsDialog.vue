<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { PlaylistDetail } from '~~/shared/types/playlist'
import { playlistMetadataSchema, type PlaylistMetadata, type PlaylistMetadataInput } from '~~/shared/schemas/playlist'
import { playlistsApi } from '~/services/api'

/**
 * "Edit details" of a playlist or group of versions (PlaylistEditor): title,
 * description and visibility in a dialog, with Cancel and Save. The page
 * itself is the track list: the form used to open it, and pushed the tracks
 * below the bottom edge although they change far more often.
 *
 * Every opening starts from the saved values, so Cancel (Esc, a click outside,
 * the Android back button) drops what was typed. Save sends the form; once it
 * went through, the page gets the saved playlist (`saved`) and the dialog
 * closes. While the form has unsaved changes, leaving the page asks first
 * (useEditForm).
 */
const props = defineProps<{
  /** The playlist as last saved. */
  playlist: PlaylistDetail
}>()

/** `v-model:open`. */
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{
  /** Saved: the playlist as the server stored it. */
  saved: [playlist: PlaylistDetail]
}>()

// "Changes saved".
const toast = useToast()

/** Words of this purpose ("playlist" / "group"). */
const info = computed(() => PLAYLIST_PURPOSE_INFO[props.playlist.purpose])

/** Form fields: the description is a string while editing ('' = none), null once validated. */
type FormState = Omit<PlaylistMetadataInput, 'description'> & { description: string }

/** Server data → form state. */
function toFormState(p: PlaylistDetail): FormState {
  return { title: p.title, description: p.description ?? '', visibility: p.visibility }
}

/** The form, its unsaved changes and the leave-page warning. */
const form = useEditForm<FormState>(toFormState(props.playlist))
const { state, dirty } = form
/** The save request (spinner on "Save"; the dialog stays open meanwhile). */
const saving = useAsyncTask()

// Opening starts from the saved values; closing drops what was not saved.
watch(open, () => form.reset(toFormState(props.playlist)))

// The Android back button cancels, like Cancel; not while saving.
useCloseOnBack(open, () => {
  if (!saving.running) open.value = false
})

/** Saves title, description and visibility (validated by UForm with the shared schema). */
async function onSubmit(event: FormSubmitEvent<PlaylistMetadata>) {
  // True when the save went through; false when it failed (the task showed the error, the dialog stays).
  const saved = await saving.run(async () => {
    // The playlist as the server stored it.
    const updated = await playlistsApi.update(props.playlist.id, event.data)
    form.reset(toFormState(updated))
    emit('saved', updated)
  }, 'Save failed')
  if (!saved) return
  toast.add({ title: 'Changes saved', icon: 'i-lucide-check', color: 'success' })
  open.value = false
}

/** Description placeholder: a group's description is the note its listeners read. */
const descriptionPlaceholder = computed(() => props.playlist.purpose === 'versions'
  ? 'A note for your listeners, e.g. “Which one do you prefer?”'
  : 'What is this playlist about?')
</script>

<template>
  <UModal
    v-model:open="open"
    :title="`Edit ${info.noun} details`"
    description="Title, description and who can listen."
    :dismissible="!saving.running"
  >
    <!-- The form, validated with the shared schema; the footer's Save submits it by its id -->
    <template #body>
      <UForm
        id="playlist-form"
        :schema="playlistMetadataSchema"
        :state="state"
        class="grid gap-4"
        @submit="onSubmit"
      >
        <!-- Title (required) -->
        <UFormField
          label="Title"
          name="title"
          required
        >
          <UInput
            v-model="state.title"
            class="w-full"
            data-testid="playlist-field-title"
          />
        </UFormField>

        <!-- Description: shown under the title here and on the public page (a group's note to its listeners) -->
        <UFormField
          label="Description"
          name="description"
        >
          <UTextarea
            v-model="state.description"
            :rows="3"
            autoresize
            :maxrows="12"
            :placeholder="descriptionPlaceholder"
            class="w-full"
            data-testid="playlist-field-description"
          />
        </UFormField>

        <!-- Visibility: private, or shared by link (unlisted / public) -->
        <UFormField
          label="Visibility"
          name="visibility"
        >
          <URadioGroup
            v-model="state.visibility"
            :items="VISIBILITY_ITEMS"
            variant="card"
            :ui="VISIBILITY_GROUP_UI"
            class="w-full"
          />
        </UFormField>
      </UForm>
    </template>

    <!-- Cancel, and Save (enabled once something changed) -->
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
          form="playlist-form"
          icon="i-lucide-save"
          label="Save"
          :loading="saving.running"
          :disabled="!dirty"
          data-testid="save-playlist"
        />
      </div>
    </template>
  </UModal>
</template>
