<script setup lang="ts">
/**
 * Track editor (client-rendered), in three tabs:
 *   Details → metadata, visibility (+ sharing box), Suno prompt, mastering, draft/final
 *   Lyrics  → plain lyrics with [Section] headers
 *   Sync    → tap-to-sync editor and detailed waveform (LyricsSyncEditor)
 * Cover and deletion live in the side column (the cover above
 * TrackEditSidebar) and save immediately; the form saves everything else
 * with "Save" and warns about unsaved changes.
 *
 * Below `md` the page is one column: the cover as a compact row at the top,
 * then the form, then file details, sharing and deletion (the side column
 * first put about two screens of it before the Title field). There a Save
 * bar at the bottom of the screen (SaveBar) shows while there are unsaved
 * changes, the header's Save being out of reach once the form is scrolled.
 */
import type { FormSubmitEvent, TabsItem } from '@nuxt/ui'
import type { TrackDetail } from '~~/shared/types/track'
import { buildCoverPath } from '~~/shared/utils/storage-paths'
import { trackMetadataSchema, type TrackMetadata, type TrackMetadataInput } from '~~/shared/schemas/track'
import { tracksApi } from '~/services/api'

// The track id comes from the route.
const route = useRoute()
/** Track id from the URL (/tracks/:id/edit). */
const id = route.params.id as string

// Edits are pushed to the player, and the Play button toggles this track.
const player = usePlayerStore()
// Success and failure messages.
const toast = useToast()

// The track (an error when missing or someone else's).
const { data: track, error } = await useAsyncData(`track-${id}`, () => tracksApi.get(id))

// Missing or someone else's track: the error page (404).
if (error.value || !track.value) {
  throw createError({ statusCode: error.value?.statusCode ?? 404, message: 'Track not found', fatal: true })
}

// Browser tab title, following the track's title: "Night drive · Edit · Chronovault".
usePageTitle(() => `${track.value?.title ?? 'Track'} · Edit`)

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
    status: t.status,
    lyrics: t.lyrics ?? '',
    lyricsSynced: t.lyricsSynced,
  }
}

/** The form, its unsaved changes (also the Save bar, and room for it at the page's end) and the leave-page warning. */
const form = useEditForm<FormState>(toFormState(track.value))
const { state, dirty } = form
/** The save request (spinner on "Save"). */
const saving = useAsyncTask()

// The number input emits undefined when cleared (or NaN): the schema expects null.
const year = computed({
  get: () => state.year ?? undefined,
  set: (value: number | null | undefined) => {
    state.year = value == null || Number.isNaN(value) ? null : value
  },
})

/** Open tab: details, lyrics or sync. */
const tab = ref('details')
/** The three tabs; `slot` names the template block that renders each one. */
const tabs: TabsItem[] = [
  { label: 'Details', value: 'details', slot: 'details', icon: 'i-lucide-list' },
  { label: 'Lyrics', value: 'lyrics', slot: 'lyrics', icon: 'i-lucide-text' },
  { label: 'Sync', value: 'sync', slot: 'sync', icon: 'i-lucide-timer' },
]

/** Keeps the page and the player (title, cover, lyrics) in sync with the saved track (form or cover). */
function applyServerTrack(updated: TrackDetail) {
  track.value = updated
  player.syncTrack(updated)
}

// Cover: picked and cropped → `<userId>/<trackId>.webp` in Storage → PATCH coverPath; saved at once.
const cover = useCoverEditor({
  path: userId => buildCoverPath(userId, id),
  save: async coverPath => applyServerTrack(await tracksApi.update(id, { coverPath })),
})

/** Saves the whole form (already validated by UForm with the shared schema). */
async function onSubmit(event: FormSubmitEvent<TrackMetadata>) {
  // The form as sent: what is changed while the request is on its way stays (see useEditForm).
  const sent = form.snapshot()
  // True when the save went through; false when it failed (the task showed the error).
  const saved = await saving.run(async () => {
    const updated = await tracksApi.update(id, event.data)
    applyServerTrack(updated)
    // The form takes the normalized values back (trimmed texts…), except where edited meanwhile.
    form.reset(toFormState(updated), sent)
  }, 'Save failed')
  if (saved) toast.add({ title: 'Changes saved', icon: 'i-lucide-check', color: 'success' })
}

/** Validation failed (UForm): show where. */
function onFormError() {
  // Errors may sit in a hidden tab: go back to the details.
  tab.value = 'details'
  toast.add({ title: 'Check the highlighted fields', color: 'error' })
}

/** The side column deleted the track: no "unsaved changes" warning, back to the library. */
async function onDeleted() {
  form.markSaved()
  toast.add({ title: 'Track deleted', icon: 'i-lucide-trash-2' })
  await navigateTo('/')
}

// "Download": the stored file with the saved metadata written in (unsaved edits are not).
const { download, isDownloading } = useTrackDownload()

/** This track is in the player (Play/Pause button state). */
const isCurrent = computed(() => player.current?.id === id)
</script>

<template>
  <UContainer
    v-if="track"
    class="max-w-5xl py-6 sm:py-8"
    :class="{ 'max-md:pb-20': dirty }"
  >
    <!--
      Header: back, title, Play/Pause, Download, Save. On phones Play and Download are icons only
      (their text shows from `sm`, and `aria-label` names them for screen readers meanwhile),
      so the title keeps most of the row instead of shrinking to a few letters. Save shows from
      `md`: below it the Save bar (SaveBar) comes up whenever there is something to save.
    -->
    <div class="mb-6 flex flex-wrap items-center gap-2">
      <IconButton
        to="/"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        label="Back to library"
      />
      <h1 class="min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight">
        {{ track.title }}
      </h1>
      <UButton
        :icon="isCurrent && player.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
        :aria-label="isCurrent && player.isPlaying ? 'Pause' : 'Play'"
        color="neutral"
        variant="subtle"
        @click="player.playTrack(track)"
      >
        <span class="hidden sm:inline">{{ isCurrent && player.isPlaying ? 'Pause' : 'Play' }}</span>
      </UButton>
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
        :loading="saving.running"
        :disabled="!dirty"
        class="max-md:hidden"
        data-testid="save-track"
      />
    </div>

    <!--
      From `md`, two columns: cover and side column on the left, the form on the right across
      both rows (the first row as tall as the cover, the second taking the rest). Below `md`, in
      the order written: cover, form, side column.
    -->
    <div class="grid gap-8 md:grid-cols-[16rem_1fr] md:grid-rows-[auto_1fr] md:gap-y-6">
      <!-- Cover (saved at once) -->
      <TrackCoverPicker
        :url="track.coverUrl"
        :title="track.title"
        :busy="cover.busy"
        class="md:col-start-1 md:row-start-1"
        @select="cover.select"
        @remove="cover.remove"
      />

      <!-- Main column: the form, its fields in three tabs (Save in the header submits it by its id) -->
      <UForm
        id="track-form"
        :schema="trackMetadataSchema"
        :state="state"
        class="min-w-0 md:col-start-2 md:row-span-2 md:row-start-1"
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

              <!-- Genre: a built-in one, one of the user's own, or a new one typed in -->
              <UFormField
                label="Genre"
                name="genreId"
                help="Type a new name to create a custom genre."
              >
                <TrackGenreSelect v-model="state.genreId" />
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

              <!-- Draft (work in progress, e.g. one of several versions) or the final one -->
              <UFormField
                label="Version"
                name="status"
                help="Drafts are marked “Work in progress” on share pages."
              >
                <div class="flex h-8 items-center">
                  <USwitch
                    :model-value="state.status === 'final'"
                    :label="state.status === 'final' ? 'Final' : 'Draft'"
                    data-testid="field-status"
                    @update:model-value="state.status = $event ? 'final' : 'draft'"
                  />
                </div>
              </UFormField>

              <!-- Description: shown on the share page and in the full-screen player -->
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

              <!-- Suno prompt: a private note, never shared -->
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

              <!-- Visibility: private, unlisted, public (with what each means) -->
              <UFormField
                label="Visibility"
                name="visibility"
                class="sm:col-span-2"
              >
                <URadioGroup
                  v-model="state.visibility"
                  :items="VISIBILITY_ITEMS"
                  variant="card"
                  :ui="VISIBILITY_GROUP_UI"
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

      <!-- Side column: file info, sharing, deletion -->
      <TrackEditSidebar
        :track="track"
        class="md:col-start-1 md:row-start-2"
        @deleted="onDeleted"
      />
    </div>

    <!-- Below `md`: Save within reach while there is something to save -->
    <SaveBar
      :show="dirty"
      form="track-form"
      :loading="saving.running"
    />
  </UContainer>
</template>
