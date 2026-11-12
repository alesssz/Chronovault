<script setup lang="ts">
/**
 * Metadata export and import (account menu → Export & import metadata):
 * every track's metadata in one file, and many tracks filled in from one,
 * after uploading them all at once.
 *
 *   1. The download, in Excel, CSV or JSON: every track by title with every
 *      field it has (GET /api/tracks/metadata, app/lib/metadata-files.ts).
 *      It is the export and the template alike: imported back unchanged, it
 *      changes nothing.
 *   2. The filled-in file uploaded: read in the browser, each row matched to
 *      its track by title (trimmed, case aside) and compared with it
 *      (shared/utils/metadata-import.ts). Nothing is saved yet: the page shows
 *      what changes, track by track, and every row that will not be applied,
 *      with why (title not found, shared by several tracks, on two rows of the
 *      file, a value that cannot be read, a genre not in the list, a subgenre
 *      incoherent with its genre).
 *   3. "Apply": the subgenres the file names that do not exist are created
 *      (as the user's own, under their genre), then each track is saved with
 *      PATCH /api/tracks/:id, the edit page's own request and checks (a few
 *      at a time). Failures are listed; the rest stays saved.
 *
 * Step 1 also lists the genres and subgenres (GenreReference): the names the
 * file's genre columns take, for CSV and JSON, which have no Help sheet, and
 * above them the user's own subgenres, to rename or delete (OwnSubgenres):
 * where every name is listed, a typo made in the editor or by an import is
 * found and fixed.
 *
 * An empty cell leaves its field as it is. Every user has it: it only ever
 * reaches the user's own tracks, like the rest of the app.
 */
import type { TrackUpdateInput } from '~~/shared/schemas/track'
import type { TrackMetadata } from '~~/shared/types/track'
import { parseImportRows, planImport, IMPORT_COLUMNS, IMPORT_COLUMN_HELP, type ImportPlan, type ImportUpdate, type NewSubgenre } from '~~/shared/utils/metadata-import'
import { METADATA_FILE_ACCEPT, readMetadataFile, templateCsv, templateJson, templateRows, templateXlsx, type MetadataFormat } from '~/lib/metadata-files'
import { saveFile } from '~/lib/save-file'
import { tracksApi } from '~/services/api'

// Browser tab title: "Metadata · Chronovault".
usePageTitle('Metadata')

const toast = useToast()
// Every track with every field (long texts included): the downloads, and what a file is compared with.
const { data: library, refresh } = await useAsyncData('track-metadata', () => tracksApi.metadata(), {
  default: () => [] as TrackMetadata[],
})
// Genres and subgenres: names in the downloads, matching them (and creating subgenres) on import.
const { genres, genreName, subgenreName, createSubgenre } = useGenres()

// --- 1. The download: export and template -------------------------------------------------

/** The file being built (its button spins). */
const building = ref<MetadataFormat | null>(null)

/**
 * Downloads every track's metadata in a format: `chronovault-metadata.xlsx`
 * and so on. Built from the data loaded with the page, which Apply reads
 * again: a download after an import holds the new values.
 */
async function downloadTemplate(format: MetadataFormat) {
  building.value = format
  try {
    // Every track's fields as text, the genre and subgenre by name.
    const rows = templateRows(library.value, genreName, subgenreName)
    // The file in the format asked for (the Excel one also lists the genres and subgenres on its Help sheet).
    const blob = format === 'xlsx' ? await templateXlsx(rows, genres.value) : format === 'csv' ? templateCsv(rows) : templateJson(rows)
    saveFile(blob, `chronovault-metadata.${format}`)
  }
  catch (error) {
    toast.add({ title: 'Download failed', description: getErrorMessage(error), color: 'error' })
  }
  finally {
    building.value = null
  }
}

// --- 2. The filled-in file, read and compared ---------------------------------------------

/** The file picked (UFileUpload's model). */
const picked = ref<File | null>(null)
/** The file could not be read, or has no title column: why. */
const readError = ref<string | null>(null)
/** Headers the import does not know: ignored. */
const ignoredHeaders = ref<string[]>([])
/** What the file would change, once read. */
const plan = ref<ImportPlan | null>(null)
/** The file is being read. */
const reading = ref(false)

watch(picked, async (file) => {
  plan.value = null
  readError.value = null
  ignoredHeaders.value = []
  // Cleared after Apply: the outcome stays on screen until another file is picked.
  if (!file) return
  result.value = null
  reading.value = true
  try {
    const { headers, rows } = await readMetadataFile(file)
    const parsed = parseImportRows(rows, headers)
    ignoredHeaders.value = parsed.ignoredHeaders
    if (parsed.missingTitle) readError.value = 'The file has no "title" column: it is how each row finds its track.'
    else if (!parsed.rows.length) readError.value = 'The file has no rows with a title.'
    else plan.value = planImport(parsed, library.value, genres.value)
  }
  catch (error) {
    readError.value = getErrorMessage(error, 'The file could not be read.')
  }
  finally {
    reading.value = false
  }
})

/** Rows that will not be applied, all reasons together. */
const skippedCount = computed(() => {
  const p = plan.value
  if (!p) return 0
  return p.notFound.length + p.ambiguous.length + p.repeated.reduce((n, r) => n + r.lines.length, 0) + p.invalid.length
})

// --- 3. Applying ---------------------------------------------------------------------------

/** Tracks saved so far (the progress), while applying. */
const saved = ref(0)
/** Applying now. */
const applying = ref(false)
/** What happened: tracks saved, and those that failed with why. */
const result = ref<{ saved: number, failed: { title: string, error: string }[] } | null>(null)

/** Tracks saved at once: a few requests in parallel, not a burst of hundreds. */
const PARALLEL_SAVES = 4

/** A new subgenre's key: its genre and its folded name (the plan has each once). */
function newSubgenreKey(subgenre: NewSubgenre): string {
  return `${subgenre.genreId}:${foldCase(subgenre.name)}`
}

/**
 * A row's fields as the edit page's PATCH body: the genre by its id, the
 * subgenre by its id (a new one's, created first, from `created`). A new
 * genre without a subgenre: the server clears the old one.
 */
function updateBody(update: ImportUpdate, created: Map<string, string>): TrackUpdateInput {
  // The other fields as they are; the genre and subgenre added below when they change.
  const body: TrackUpdateInput = { ...update.fields }
  if (update.genreId) body.genreId = update.genreId
  if (update.subgenre) body.subgenreId = 'id' in update.subgenre ? update.subgenre.id : created.get(newSubgenreKey(update.subgenre))!
  return body
}

/** Creates the new subgenres, then saves every track that changes. */
async function apply() {
  const p = plan.value
  if (!p || applying.value) return
  applying.value = true
  saved.value = 0
  const failed: { title: string, error: string }[] = []
  try {
    // The new subgenres' ids by key, created first.
    const created = new Map<string, string>()
    for (const subgenre of p.newSubgenres) {
      created.set(newSubgenreKey(subgenre), (await createSubgenre(subgenre.genreId, subgenre.name)).id)
    }
    // The tracks, a few at a time.
    const queue = [...p.updates]
    const worker = async () => {
      for (let update = queue.shift(); update; update = queue.shift()) {
        try {
          await tracksApi.update(update.trackId, updateBody(update, created))
          saved.value++
        }
        catch (error) {
          failed.push({ title: update.title, error: getErrorMessage(error) })
        }
      }
    }
    await Promise.all(Array.from({ length: PARALLEL_SAVES }, worker))
  }
  catch (error) {
    // A subgenre could not be created: nothing was saved.
    toast.add({ title: 'Import stopped', description: getErrorMessage(error), color: 'error' })
  }
  finally {
    applying.value = false
  }
  result.value = { saved: saved.value, failed }
  if (saved.value) {
    toast.add({ title: `${pluralize(saved.value, 'track')} updated`, color: 'success' })
    // The next file is compared with the new values, and the library's list (where loaded) shows them.
    await Promise.all([refresh(), refreshNuxtData('tracks')])
  }
  // Applied: the preview is over (a new file starts over).
  plan.value = null
  picked.value = null
}
</script>

<template>
  <UContainer class="max-w-4xl py-6 sm:py-8">
    <div class="mb-6 flex items-center gap-2">
      <IconButton
        to="/"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        label="Back to library"
      />
      <h1 class="text-2xl font-semibold tracking-tight">
        Metadata
      </h1>
    </div>
    <p class="mb-8 text-muted">
      Download your tracks' metadata, change what you want, and upload the file here to fill in many tracks at once. Each
      row finds its track by its title; an empty cell leaves that field as it is. Nothing is saved until you apply it.
    </p>

    <!-- 1. The download: export and template -->
    <section
      class="mb-8 space-y-3"
      aria-labelledby="import-step-template"
    >
      <h2
        id="import-step-template"
        class="text-lg font-semibold"
      >
        1 · Download your metadata
      </h2>
      <p class="text-sm text-muted">
        Your {{ pluralize(library.length, 'track') }}, every field included: it is a full export, and the template to
        fill in. Synced lyrics are not part of it.
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          label="Excel"
          icon="i-lucide-sheet"
          color="neutral"
          variant="subtle"
          :loading="building === 'xlsx'"
          data-testid="template-xlsx"
          @click="downloadTemplate('xlsx')"
        />
        <UButton
          label="CSV"
          icon="i-lucide-file-text"
          color="neutral"
          variant="subtle"
          :loading="building === 'csv'"
          data-testid="template-csv"
          @click="downloadTemplate('csv')"
        />
        <UButton
          label="JSON"
          icon="i-lucide-braces"
          color="neutral"
          variant="subtle"
          :loading="building === 'json'"
          data-testid="template-json"
          @click="downloadTemplate('json')"
        />
      </div>
      <!-- What each column takes (the Excel file has it on its Help sheet too) -->
      <HelpAccordion label="The columns">
        <dl class="grid gap-x-4 gap-y-2 sm:grid-cols-[10rem_1fr]">
          <template
            v-for="column in IMPORT_COLUMNS"
            :key="column"
          >
            <dt class="font-mono text-xs leading-5 text-highlighted">
              {{ column }}
            </dt>
            <dd class="text-muted">
              {{ IMPORT_COLUMN_HELP[column] }}
            </dd>
          </template>
        </dl>
      </HelpAccordion>
      <!-- The names the genre and subgenre columns take (the Excel file lists them on its Help sheet too) -->
      <GenreReference :genres="genres" />
    </section>

    <!-- 2. The filled-in file -->
    <section
      class="space-y-4"
      aria-labelledby="import-step-file"
    >
      <h2
        id="import-step-file"
        class="text-lg font-semibold"
      >
        2 · Upload the filled-in file
      </h2>
      <UFileUpload
        v-model="picked"
        :accept="METADATA_FILE_ACCEPT"
        icon="i-lucide-file-up"
        label="Drop the file here, or click to choose it"
        description="Excel (.xlsx), CSV or JSON"
        layout="list"
        :preview="false"
        :disabled="applying"
        class="min-h-32 w-full"
        data-testid="import-dropzone"
      />

      <p
        v-if="reading"
        class="text-sm text-muted"
      >
        Reading the file…
      </p>
      <UAlert
        v-if="readError"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="This file cannot be imported"
        :description="readError"
        data-testid="import-error"
      />
      <UAlert
        v-if="ignoredHeaders.length"
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        :title="`Ignored ${pluralize(ignoredHeaders.length, 'column')}`"
        :description="ignoredHeaders.map(h => `“${h}”`).join(', ')"
        data-testid="import-ignored-columns"
      />

      <!-- What the file would do: counts, what will not be applied and why, then each change -->
      <div
        v-if="plan"
        class="space-y-4"
        data-testid="import-preview"
      >
        <p
          class="text-sm"
          data-testid="import-summary"
        >
          <span
            v-if="picked"
            class="text-muted"
          >{{ picked.name }}: </span>
          <strong>{{ pluralize(plan.updates.length, 'track') }} to update</strong>
          <span class="text-muted"> · {{ plan.unchanged.length }} unchanged · {{ skippedCount }} skipped</span>
        </p>

        <!-- Subgenres the file names that do not exist yet: "Metal › Swamp Metal", created as the user's own on Apply -->
        <UAlert
          v-if="plan.newSubgenres.length"
          color="info"
          variant="subtle"
          icon="i-lucide-tag"
          :title="`New ${plan.newSubgenres.length === 1 ? 'subgenre' : 'subgenres'}, created as yours when applied`"
          :description="plan.newSubgenres.map(s => `${s.genreName} › ${s.name}`).join(', ')"
          data-testid="import-new-subgenres"
        />

        <!-- Rows that will not be applied -->
        <UAlert
          v-if="skippedCount"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="`${pluralize(skippedCount, 'row')} will be skipped`"
          data-testid="import-skipped"
        >
          <template #description>
            <ul class="mt-1 space-y-1">
              <li
                v-for="row in plan.notFound"
                :key="`n${row.line}`"
                data-testid="import-not-found"
              >
                Row {{ row.line }}, “{{ row.title }}”: no track has this title.
              </li>
              <li
                v-for="row in plan.ambiguous"
                :key="`a${row.line}`"
                data-testid="import-ambiguous"
              >
                Row {{ row.line }}, “{{ row.title }}”: {{ row.count }} tracks have this title; change it on all but one.
              </li>
              <li
                v-for="row in plan.repeated"
                :key="`r${row.title}`"
                data-testid="import-repeated"
              >
                Rows {{ row.lines.join(', ') }}, “{{ row.title }}”: the same title on several rows.
              </li>
              <li
                v-for="row in plan.invalid"
                :key="`i${row.line}`"
                data-testid="import-invalid"
              >
                Row {{ row.line }}, “{{ row.title }}”: {{ row.errors.join('; ') }}.
              </li>
            </ul>
          </template>
        </UAlert>

        <!-- Each track that changes, with each field before → after -->
        <ol
          v-if="plan.updates.length"
          class="divide-y divide-default rounded-xl border border-default"
          aria-label="Changes"
        >
          <li
            v-for="update in plan.updates"
            :key="update.trackId"
            class="px-4 py-3"
            data-testid="import-update"
          >
            <p class="flex items-baseline gap-2">
              <span class="font-medium">{{ update.title }}</span>
              <span class="text-xs text-dimmed">row {{ update.line }}</span>
            </p>
            <dl class="mt-1 grid gap-x-3 gap-y-0.5 text-sm sm:grid-cols-[8rem_1fr]">
              <template
                v-for="change in update.changes"
                :key="change.column"
              >
                <dt class="font-mono text-xs leading-5 text-muted">
                  {{ change.column }}
                </dt>
                <dd class="min-w-0 break-words">
                  <!-- Nothing before: "empty", not struck through (it read as a value being removed) -->
                  <span
                    v-if="change.from"
                    class="text-dimmed line-through"
                  >{{ change.from }}</span>
                  <span
                    v-else
                    class="text-dimmed italic"
                  >empty</span>
                  →
                  <span
                    v-if="change.to"
                    class="text-highlighted"
                  >{{ change.to }}</span>
                  <span
                    v-else
                    class="text-dimmed italic"
                  >empty</span>
                </dd>
              </template>
            </dl>
            <p
              v-if="update.syncedLyricsKept"
              class="mt-1 text-xs text-warning"
            >
              Its synced lyrics are kept as they are: if the lines changed, use “Reload from lyrics” in its Sync tab.
            </p>
          </li>
        </ol>

        <div class="flex flex-wrap items-center gap-3">
          <UButton
            :label="plan.updates.length ? `Apply to ${pluralize(plan.updates.length, 'track')}` : 'Nothing to apply'"
            icon="i-lucide-check"
            :disabled="!plan.updates.length"
            :loading="applying"
            data-testid="import-apply"
            @click="apply"
          />
          <span
            v-if="applying"
            class="text-sm tabular-nums text-muted"
          >Saving {{ saved }} of {{ plan.updates.length }}…</span>
        </div>
      </div>

      <!-- After applying: what was saved, and what failed -->
      <UAlert
        v-if="result"
        :color="result.failed.length ? 'warning' : 'success'"
        variant="subtle"
        :icon="result.failed.length ? 'i-lucide-triangle-alert' : 'i-lucide-circle-check'"
        :title="`${pluralize(result.saved, 'track')} updated${result.failed.length ? `, ${result.failed.length} not` : ''}`"
        data-testid="import-result"
      >
        <template
          v-if="result.failed.length"
          #description
        >
          <ul class="mt-1 space-y-1">
            <li
              v-for="failure in result.failed"
              :key="failure.title"
            >
              “{{ failure.title }}”: {{ failure.error }}
            </li>
          </ul>
        </template>
      </UAlert>
    </section>
  </UContainer>
</template>
