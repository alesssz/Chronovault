<script setup lang="ts">
/**
 * Track editor (client-rendered), in three tabs:
 *   Details → metadata, description, Suno prompt, visibility
 *   Lyrics  → plain lyrics with [Section] headers
 *   Sync    → tap-to-sync editor and detailed waveform (LyricsSyncEditor)
 * Cover and deletion live in the side column (the cover above
 * TrackEditSidebar) and save immediately; the form saves everything else
 * with "Save" and warns about unsaved changes, the Status switches too
 * (mastered, draft/final), which sit in the left column under the cover.
 *
 * Below `md` the page is one column: the cover as a compact row at the top,
 * then the form, then status, file details, sharing and deletion (the side column
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

/** The form, its unsaved changes (also the Save bar, and room for it at the page's end) and the leave-page question. */
const form = useEditForm<FormState>(toFormState(track.value), { save: saveBeforeLeaving })
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

/** Saves the form's values, already validated with the shared schema; true when the save went through. */
async function save(values: TrackMetadata): Promise<boolean> {
  // The form as sent: what is changed while the request is on its way stays (see useEditForm).
  const sent = form.snapshot()
  // False when it failed (the task showed the error).
  const saved = await saving.run(async () => {
    const updated = await tracksApi.update(id, values)
    applyServerTrack(updated)
    // The form takes the normalized values back (trimmed texts…), except where edited meanwhile.
    form.reset(toFormState(updated), sent)
  }, 'Save failed')
  if (saved) toast.add({ title: 'Changes saved', icon: 'i-lucide-check', color: 'success' })
  return saved
}

/** Save (header or Save bar): UForm validated the form. */
async function onSubmit(event: FormSubmitEvent<TrackMetadata>) {
  await save(event.data)
}

/** The form, for "Save and leave" (useEditForm), which saves without the Save button. */
const trackForm = useTemplateRef('trackForm')

/** "Save and leave": the same checks as Save, then the save; false keeps the page, errors shown. */
async function saveBeforeLeaving(): Promise<boolean> {
  // The values as UForm submits them; an invalid form shows its errors and gives none.
  const values = await trackForm.value?.validate({ nested: true, transform: true }).catch(() => undefined)
  if (!values) {
    onFormError()
    return false
  }
  return save(values as TrackMetadata)
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
      `md`, grey and disabled until something changed, then gold (a disabled gold button looked
      the same as an active one); below `md` the Save bar (SaveBar) comes up whenever there is
      something to save.
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
        :color="dirty ? 'primary' : 'neutral'"
        :variant="dirty ? 'solid' : 'subtle'"
        :loading="saving.running"
        :disabled="!dirty"
        class="max-md:hidden"
        data-testid="save-track"
      />
    </div>

    <!--
      From `md`, two columns: cover, then status and side column on the left, the form on the
      right across both rows (the first row as tall as the cover, the second taking the rest).
      Below `md`, in the order written: cover, form, status and side column.
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
        ref="trackForm"
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
          <!--
            Details tab. A grid of six columns from `sm`, so each row is full: title and composers
            across it, album, year and genre in thirds, then description, Suno prompt and
            visibility across it. Below `sm` two columns: album and year share a row (a row each
            made the phone's form a screen longer), the rest across it. (Mastering and version,
            the track's state, are in the left column: as switches on a row of their own they left
            it looking empty.)
          -->
          <template #details>
            <div class="grid grid-cols-2 gap-4 pt-4 sm:grid-cols-6">
              <UFormField
                label="Title"
                name="title"
                required
                class="col-span-full"
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
                class="col-span-full"
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
                class="min-w-0 sm:col-span-2"
              >
                <UInput
                  v-model="state.album"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                label="Year"
                name="year"
                class="min-w-0 sm:col-span-2"
              >
                <!--
                  No − / + buttons: a year is typed, not stepped to, and they took a third of the
                  field (the arrow keys still step it). Text at the start, like the fields beside it.
                -->
                <UInputNumber
                  v-model="year"
                  :min="1000"
                  :max="9999"
                  :format-options="{ useGrouping: false }"
                  :increment="false"
                  :decrement="false"
                  placeholder="e.g. 2026"
                  :ui="{ base: 'text-start' }"
                  class="w-full"
                />
              </UFormField>

              <!--
                Genre: a built-in one, one of the user's own, or a new one typed in. No help line
                under it (the menu's search box says so): it made this row taller than album and
                year.
              -->
              <UFormField
                label="Genre"
                name="genreId"
                class="col-span-full sm:col-span-2"
              >
                <TrackGenreSelect v-model="state.genreId" />
              </UFormField>

              <!--
                Description: shown on the share page and in the full-screen player. It and the Suno
                prompt start at four rows and grow with the text (at eight, empty, the two pushed
                Visibility below the first screen).
              -->
              <UFormField
                label="Description"
                name="description"
                class="col-span-full"
              >
                <UTextarea
                  v-model="state.description"
                  :rows="4"
                  autoresize
                  :maxrows="24"
                  placeholder="Notes, inspiration, summary…"
                  class="w-full"
                  data-testid="field-description"
                />
              </UFormField>

              <!--
                Suno prompt: a private note, never shared. What it is for says its placeholder, as
                the description's does (a help line under it was the form's only one).
              -->
              <UFormField
                label="Suno prompt"
                name="sunoPrompt"
                class="col-span-full"
              >
                <UTextarea
                  v-model="state.sunoPrompt"
                  :rows="4"
                  autoresize
                  :maxrows="24"
                  placeholder="The prompt used to generate the track (never shared)"
                  class="w-full font-mono"
                  data-testid="field-suno-prompt"
                />
              </UFormField>

              <!-- Visibility: private, unlisted, public (with what each means) -->
              <UFormField
                label="Visibility"
                name="visibility"
                class="col-span-full"
              >
                <URadioGroup
                  v-model="state.visibility"
                  :items="TRACK_VISIBILITY_ITEMS"
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

      <div class="space-y-6 md:col-start-1 md:row-start-2">
        <!--
          Status: mastered or not, draft or final. Part of the form's state (Save saves them, an
          edit turns it gold) though outside its element: the switches are buttons, not inputs,
          so nothing of theirs is submitted by the browser. Here, beside the file's data, as the
          track's state; in the Details grid they sat on a row of their own that looked empty.
        -->
        <section
          class="space-y-3"
          aria-labelledby="track-status-heading"
          data-testid="track-status"
        >
          <h2
            id="track-status-heading"
            class="text-xs font-semibold uppercase tracking-widest text-muted"
          >
            Status
          </h2>
          <USwitch
            v-model="state.mastered"
            label="Mastered"
            data-testid="field-mastered"
          />
          <!--
            Draft (work in progress, e.g. one of several versions) or the final one. Fixed labels,
            named by what "on" means: the switch shows the state, and a label that changed with it
            ("Not mastered") read as the switch's name.
          -->
          <USwitch
            :model-value="state.status === 'final'"
            label="Final version"
            description="Drafts are marked “Work in progress” on share pages."
            data-testid="field-status"
            @update:model-value="state.status = $event ? 'final' : 'draft'"
          />
        </section>

        <!-- Side column: file info, sharing, deletion -->
        <TrackEditSidebar
          :track="track"
          @deleted="onDeleted"
        />
      </div>
    </div>

    <!-- Below `md`: Save within reach while there is something to save -->
    <SaveBar
      :show="dirty"
      form="track-form"
      :loading="saving.running"
    />
  </UContainer>
</template>
