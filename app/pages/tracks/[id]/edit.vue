<script setup lang="ts">
/**
 * Track editor (client-rendered), in three tabs:
 *   Details → metadata, visibility (+ sharing box), Suno prompt, mastering
 *   Lyrics  → plain lyrics with [Section] headers
 *   Sync    → tap-to-sync editor and detailed waveform (LyricsSyncEditor)
 * Cover and deletion live in the side column and save immediately; the
 * form saves everything else with "Save" and warns about unsaved changes.
 */
import type { FormSubmitEvent, TabsItem } from '@nuxt/ui'
import type { TrackDetail, TrackVisibility } from '~~/shared/types/track'
import { trackMetadataSchema, type TrackMetadata, type TrackMetadataInput } from '~~/shared/schemas/track'
import { COVERS_BUCKET, buildCoverPath } from '~~/shared/utils/storage-paths'
import { toSquareWebp, type CropRect } from '~/lib/image'
import { tracksApi } from '~/services/api'

// The track id comes from the route.
const route = useRoute()
/** Track id from the URL (/tracks/:id/edit). */
const id = route.params.id as string

// Supabase: the browser uploads the cover straight to Storage (own folder).
const supabase = useSupabaseClient()
// The signed-in user's id builds the cover path `<userId>/<trackId>.webp`.
const user = useSupabaseUser()
// Edits are pushed to the player, and the Play button toggles this track.
const player = usePlayerStore()
// Success and failure messages.
const toast = useToast()
const { genres, createGenre } = useGenres()

const { data: track, error } = await useAsyncData(`track-${id}`, () => tracksApi.get(id))

// Missing or someone else's track: the error page (404).
if (error.value || !track.value) {
  throw createError({ statusCode: error.value?.statusCode ?? 404, message: 'Track not found', fatal: true })
}

useSeoMeta({ title: () => `${track.value?.title ?? 'Track'} · Edit` })

// --- Form state ------------------------------------------------------------------
// Optional texts are strings in the form ('' = empty): the schema turns them into null.
/** Optional text fields of the form. */
type TextField = 'composers' | 'album' | 'description' | 'sunoPrompt' | 'lyrics'
/** The form's own shape: the schema input, with optional texts as plain strings. */
type FormState = Omit<TrackMetadataInput, TextField> & Record<TextField, string>

/** Server data → form state (null texts become ''). */
function toFormState(t: TrackDetail): FormState {
  return {
    title: t.title,
    composers: t.composers ?? '',
    genreId: t.genreId,
    year: t.year,
    album: t.album ?? '',
    description: t.description ?? '',
    sunoPrompt: t.sunoPrompt ?? '',
    mastered: t.mastered,
    visibility: t.visibility,
    lyrics: t.lyrics ?? '',
    lyricsSynced: t.lyricsSynced,
  }
}

/** The form, bound to the inputs. */
const state = reactive<FormState>(toFormState(track.value))
/** Snapshot of the last saved state: `dirty` compares against it. */
const baseline = ref(JSON.stringify(state))
/** Unsaved changes: enables "Save" and the leave-page warning. */
const dirty = computed(() => JSON.stringify(state) !== baseline.value)
/** The save request is running (spinner on "Save"). */
const saving = ref(false)

// Components emit undefined when cleared: the schema expects null.
const year = computed({
  get: () => state.year ?? undefined,
  set: (value: number | null | undefined) => {
    state.year = value == null || Number.isNaN(value) ? null : value
  },
})
/** Same as `year`, for the genre select. */
const genreId = computed({
  get: () => state.genreId ?? undefined,
  set: (value: string | null | undefined) => {
    state.genreId = value ?? null
  },
})

/** Genre options for the select menu (built-in and custom, sorted by name). */
const genreItems = computed(() => genres.value.map(g => ({ label: g.name, value: g.id })))

/** "Create" in the genre menu: creates the custom genre and selects it. */
async function onCreateGenre(name: string) {
  try {
    const genre = await createGenre(name)
    state.genreId = genre.id
  }
  catch (err) {
    toast.add({ title: 'Genre not created', description: getErrorMessage(err), color: 'error' })
  }
}

/** Options of the visibility radio cards. */
const visibilityItems: { value: TrackVisibility, label: string, description: string }[] = [
  { value: 'private', label: 'Private', description: 'Only you can listen to it.' },
  { value: 'unlisted', label: 'Unlisted', description: 'Anyone with the link can listen.' },
  { value: 'public', label: 'Public', description: 'Anyone with the link can listen; search engines may list it.' },
]

/** Open tab: details, lyrics or sync. */
const tab = ref('details')
/** The three tabs; `slot` names the template block that renders each one. */
const tabs: TabsItem[] = [
  { label: 'Details', value: 'details', slot: 'details', icon: 'i-lucide-list' },
  { label: 'Lyrics', value: 'lyrics', slot: 'lyrics', icon: 'i-lucide-text' },
  { label: 'Sync', value: 'sync', slot: 'sync', icon: 'i-lucide-timer' },
]

/** Keeps the page and the player (title, cover, lyrics) in sync with the saved track. */
function applyServerTrack(updated: TrackDetail) {
  track.value = updated
  player.syncTrack(updated)
}

/** Saves the whole form (already validated by UForm with the shared schema). */
async function onSubmit(event: FormSubmitEvent<TrackMetadata>) {
  saving.value = true
  try {
    const updated = await tracksApi.update(id, event.data)
    applyServerTrack(updated)
    // The form takes the normalized values back (trimmed texts…) and is clean again.
    Object.assign(state, toFormState(updated))
    baseline.value = JSON.stringify(state)
    toast.add({ title: 'Changes saved', icon: 'i-lucide-check', color: 'success' })
  }
  catch (err) {
    toast.add({ title: 'Save failed', description: getErrorMessage(err), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

/** Validation failed (UForm): show where. */
function onFormError() {
  // Errors may sit in a hidden tab: go back to the details.
  tab.value = 'details'
  toast.add({ title: 'Check the highlighted fields', color: 'error' })
}

// Leaving with unsaved changes asks first (returning false cancels the navigation).
onBeforeRouteLeave(() => {
  if (dirty.value && !window.confirm('You have unsaved changes. Leave anyway?')) return false
})

// --- Cover -----------------------------------------------------------------------
const coverBusy = ref(false)

/**
 * New cover (already cropped by the user in the crop editor): square WebP in
 * the browser → Supabase Storage (own folder, overwriting the previous one)
 * → PATCH coverPath.
 */
async function onCoverSelected(file: File, crop: CropRect) {
  // Needed for the storage path; no session = nothing to do.
  const userId = user.value?.sub
  if (!userId) return
  coverBusy.value = true
  try {
    const webp = await toSquareWebp(file, { crop })
    const path = buildCoverPath(userId, id)
    const { error: uploadError } = await supabase.storage.from(COVERS_BUCKET).upload(path, webp, {
      contentType: 'image/webp',
      upsert: true,
    })
    if (uploadError) throw uploadError
    applyServerTrack(await tracksApi.update(id, { coverPath: path }))
    toast.add({ title: 'Cover updated', icon: 'i-lucide-image', color: 'success' })
  }
  catch (err) {
    toast.add({ title: 'Cover not updated', description: getErrorMessage(err), color: 'error' })
  }
  finally {
    coverBusy.value = false
  }
}

/** Removes the cover; the server deletes the file. */
async function onCoverRemoved() {
  coverBusy.value = true
  try {
    applyServerTrack(await tracksApi.update(id, { coverPath: null }))
  }
  catch (err) {
    toast.add({ title: 'Cover not removed', description: getErrorMessage(err), color: 'error' })
  }
  finally {
    coverBusy.value = false
  }
}

// --- Deletion --------------------------------------------------------------------
/** The delete confirmation dialog. */
const deleteOpen = ref(false)
/** The delete request is running. */
const deleting = ref(false)

/** Deletes the track (and its files), stops it if playing, back to the library. */
async function onDelete() {
  deleting.value = true
  try {
    await tracksApi.remove(id)
    player.removeTrack(id)
    baseline.value = JSON.stringify(state)
    deleteOpen.value = false
    toast.add({ title: 'Track deleted', icon: 'i-lucide-trash-2' })
    await navigateTo('/')
  }
  catch (err) {
    toast.add({ title: 'Delete failed', description: getErrorMessage(err), color: 'error' })
  }
  finally {
    deleting.value = false
  }
}

// "Download": the stored file with the saved metadata written in (unsaved edits are not).
const { download, isDownloading } = useTrackDownload()

/** This track is in the player (Play/Pause button state). */
const isCurrent = computed(() => player.current?.id === id)

// --- Sharing -----------------------------------------------------------------------
// Based on the saved visibility: a change only applies once saved.
const { shareUrl, copyShareLink } = useShareLink()
/** Saved visibility is unlisted/public: show the share link. */
const isShared = computed(() => !!track.value && track.value.visibility !== 'private')
</script>

<template>
  <UContainer
    v-if="track"
    class="max-w-5xl py-6 sm:py-8"
  >
    <!-- Header: back, title, Play/Pause, Save -->
    <div class="mb-6 flex flex-wrap items-center gap-2">
      <UButton
        to="/"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        aria-label="Back to library"
      />
      <h1 class="min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight">
        {{ track.title }}
      </h1>
      <UButton
        :icon="isCurrent && player.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
        :label="isCurrent && player.isPlaying ? 'Pause' : 'Play'"
        color="neutral"
        variant="subtle"
        @click="player.playTrack(track)"
      />
      <!-- Icon only on phones, where the header is narrow. -->
      <UButton
        icon="i-lucide-download"
        color="neutral"
        variant="subtle"
        aria-label="Download"
        :loading="isDownloading(id)"
        data-testid="download-track"
        @click="download(id)"
      >
        <span class="hidden sm:inline">Download</span>
      </UButton>
      <UButton
        type="submit"
        form="track-form"
        icon="i-lucide-save"
        label="Save"
        :loading="saving"
        :disabled="!dirty"
        data-testid="save-track"
      />
    </div>

    <div class="grid gap-8 md:grid-cols-[16rem_1fr]">
      <!-- Side column: cover (saved at once), file info, sharing, deletion -->
      <aside class="space-y-6">
        <TrackCoverPicker
          :url="track.coverUrl"
          :title="track.title"
          :busy="coverBusy"
          @select="onCoverSelected"
          @remove="onCoverRemoved"
        />

        <!-- Technical data of the stored file -->
        <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <dt class="text-muted">
            Duration
          </dt>
          <dd class="text-right tabular-nums">
            {{ formatTime(track.durationSeconds) }}
          </dd>
          <dt class="text-muted">
            Format
          </dt>
          <dd class="text-right">
            {{ track.mimeType.replace('audio/', '').toUpperCase() }}
          </dd>
          <dt class="text-muted">
            Size
          </dt>
          <dd class="text-right">
            {{ formatBytes(track.sizeBytes) }}
          </dd>
          <dt class="text-muted">
            Uploaded
          </dt>
          <dd class="text-right">
            {{ new Date(track.createdAt).toLocaleDateString() }}
          </dd>
        </dl>

        <div
          class="space-y-2"
          data-testid="share-box"
        >
          <h2 class="text-xs font-semibold uppercase tracking-widest text-muted">
            Sharing
          </h2>
          <template v-if="isShared">
            <p class="text-sm text-muted">
              Anyone with the link can listen, without an account. The Suno prompt and the mastering status are never shown.
            </p>
            <UFieldGroup class="w-full">
              <UButton
                label="Copy share link"
                icon="i-lucide-link"
                color="neutral"
                variant="subtle"
                block
                data-testid="copy-share-link"
                @click="copyShareLink(id)"
              />
              <UButton
                :to="shareUrl(id)"
                target="_blank"
                icon="i-lucide-external-link"
                color="neutral"
                variant="subtle"
                aria-label="Open share page"
              />
            </UFieldGroup>
          </template>
          <p
            v-else
            class="text-sm text-muted"
          >
            Private: only you can listen. Set the visibility to Unlisted or Public and save to get a share link.
          </p>
        </div>

        <UButton
          label="Delete track"
          icon="i-lucide-trash-2"
          color="error"
          variant="soft"
          block
          @click="deleteOpen = true"
        />
      </aside>

      <UForm
        id="track-form"
        :schema="trackMetadataSchema"
        :state="state"
        class="min-w-0"
        @submit="onSubmit"
        @error="onFormError"
      >
        <UTabs
          v-model="tab"
          :items="tabs"
          :unmount-on-hide="false"
          variant="link"
          class="w-full"
        >
          <!-- Details tab: metadata, Suno prompt, mastering, visibility -->
          <template #details>
            <div class="grid gap-4 pt-4 sm:grid-cols-2">
              <UFormField
                label="Title"
                name="title"
                required
                class="sm:col-span-2"
              >
                <UInput
                  v-model="state.title"
                  class="w-full"
                  data-testid="field-title"
                />
              </UFormField>

              <UFormField
                label="Composers / Authors"
                name="composers"
                class="sm:col-span-2"
              >
                <UInput
                  v-model="state.composers"
                  placeholder="e.g. Jane Doe, John Smith"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                label="Album"
                name="album"
              >
                <UInput
                  v-model="state.album"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                label="Year"
                name="year"
              >
                <UInputNumber
                  v-model="year"
                  :min="1000"
                  :max="9999"
                  :format-options="{ useGrouping: false }"
                  placeholder="e.g. 2026"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                label="Genre"
                name="genreId"
                help="Type a new name to create a custom genre."
              >
                <USelectMenu
                  v-model="genreId"
                  :items="genreItems"
                  value-key="value"
                  create-item
                  clear
                  placeholder="Select a genre"
                  class="w-full"
                  @create="onCreateGenre"
                />
              </UFormField>

              <UFormField
                label="Mastering"
                name="mastered"
              >
                <div class="flex h-8 items-center">
                  <USwitch
                    v-model="state.mastered"
                    :label="state.mastered ? 'Mastered' : 'Not mastered'"
                  />
                </div>
              </UFormField>

              <UFormField
                label="Description"
                name="description"
                class="sm:col-span-2"
              >
                <UTextarea
                  v-model="state.description"
                  :rows="8"
                  autoresize
                  :maxrows="24"
                  placeholder="Notes, inspiration, summary…"
                  class="w-full"
                  data-testid="field-description"
                />
              </UFormField>

              <UFormField
                label="Suno prompt"
                name="sunoPrompt"
                help="The prompt used to generate the track."
                class="sm:col-span-2"
              >
                <UTextarea
                  v-model="state.sunoPrompt"
                  :rows="8"
                  autoresize
                  :maxrows="24"
                  class="w-full font-mono"
                  data-testid="field-suno-prompt"
                />
              </UFormField>

              <UFormField
                label="Visibility"
                name="visibility"
                class="sm:col-span-2"
              >
                <URadioGroup
                  v-model="state.visibility"
                  :items="visibilityItems"
                  orientation="horizontal"
                  variant="card"
                  class="w-full"
                />
              </UFormField>
            </div>
          </template>

          <!-- Lyrics tab: plain text, [Section] lines become headers -->
          <template #lyrics>
            <div class="pt-4">
              <UFormField
                name="lyrics"
                help="Lines in square brackets, e.g. [Verse] or [Chorus], are shown as section headers."
              >
                <UTextarea
                  v-model="state.lyrics"
                  :rows="18"
                  autoresize
                  :maxrows="40"
                  placeholder="[Verse 1]&#10;First line of the lyrics…&#10;&#10;[Chorus]&#10;…"
                  class="w-full"
                  data-testid="field-lyrics"
                />
              </UFormField>
            </div>
          </template>

          <!-- Sync tab: tap-to-sync editor with the detailed waveform -->
          <template #sync>
            <div class="pt-4">
              <LyricsSyncEditor
                v-model="state.lyricsSynced"
                :track="track"
                :lyrics="state.lyrics || null"
                :active="tab === 'sync'"
              />
            </div>
          </template>
        </UTabs>
      </UForm>
    </div>

    <!-- Delete confirmation -->
    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Delete this track?"
      :description="`“${track.title}” and its files will be permanently deleted.`"
      confirm-label="Delete"
      :loading="deleting"
      @confirm="onDelete"
    />
  </UContainer>
</template>
