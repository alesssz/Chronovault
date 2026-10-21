<script setup lang="ts">
/**
 * Library (home page, client-rendered): every track of the user, with
 * search, genre and mastering filters and sorting, all applied in the
 * browser (the whole library is loaded at once). Playing a track uses the
 * filtered list as the queue.
 */
import type { TrackSummary } from '~~/shared/types/track'
import { tracksApi } from '~/services/api'

useSeoMeta({ title: 'Library · ChronoPlayer' })

// Playing, and dropping deleted tracks from the queue.
const player = usePlayerStore()
// Delete confirmations and failures.
const toast = useToast()
const { genres, genreName } = useGenres()

const { data: tracks, status, error, refresh } = await useAsyncData('tracks', () => tracksApi.list(), {
  default: () => [] as TrackSummary[],
})

// --- Search and filters ----------------------------------------------------------
const search = ref('')
/** Genre id, or 'all'. */
const genreFilter = ref<string>('all')
/** Mastered tracks only, not mastered only, or both. */
const masteredFilter = ref<'all' | 'yes' | 'no'>('all')
/** Newest first (as the API returns them) or by title. */
const sort = ref<'recent' | 'title'>('recent')

/** Only genres that at least one track uses. */
const genreOptions = computed(() => [
  { label: 'All genres', value: 'all' },
  ...genres.value
    .filter(g => tracks.value.some(t => t.genreId === g.id))
    .map(g => ({ label: g.name, value: g.id })),
])

/** Options of the mastering filter. */
const masteredOptions = [
  { label: 'All', value: 'all' },
  { label: 'Mastered', value: 'yes' },
  { label: 'Not mastered', value: 'no' },
]

/** Options of the sort menu. */
const sortOptions = [
  { label: 'Most recent', value: 'recent' },
  { label: 'Title A-Z', value: 'title' },
]

/** Tracks matching the search (title, composers, album) and filters, in the chosen order. */
const filtered = computed(() => {
  const q = search.value.trim().toLocaleLowerCase('en')
  const list = tracks.value.filter((t) => {
    if (genreFilter.value !== 'all' && t.genreId !== genreFilter.value) return false
    if (masteredFilter.value !== 'all' && t.mastered !== (masteredFilter.value === 'yes')) return false
    if (!q) return true
    return [t.title, t.composers, t.album].some(v => v?.toLocaleLowerCase('en').includes(q))
  })
  return sort.value === 'title'
    ? [...list].sort((a, b) => a.title.localeCompare(b.title, 'en'))
    : list
})

/** A filter is active: the empty state offers to clear them. */
const hasFilters = computed(() => !!search.value || genreFilter.value !== 'all' || masteredFilter.value !== 'all')

/** "Clear filters" (the sort order is kept). */
function resetFilters() {
  search.value = ''
  genreFilter.value = 'all'
  masteredFilter.value = 'all'
}

// --- Actions ---------------------------------------------------------------------
/** Plays (or toggles) a track; "next"/"previous" follow what is on screen. */
function onPlay(track: TrackSummary) {
  void player.playTrack(track, filtered.value)
}

/** Track waiting for the delete confirmation (the dialog is open while set). */
const toDelete = ref<TrackSummary | null>(null)
/** The delete request is running (spinner in the dialog). */
const deleting = ref(false)
/** The confirmation dialog is open while a track is waiting to be deleted; closing it cancels. */
const deleteOpen = computed({
  get: () => toDelete.value !== null,
  set: (open) => {
    if (!open) toDelete.value = null
  },
})

/** Deletes the track, drops it from the player queue and from the list. */
async function confirmDelete() {
  const track = toDelete.value
  if (!track) return
  deleting.value = true
  try {
    await tracksApi.remove(track.id)
    player.removeTrack(track.id)
    tracks.value = tracks.value.filter(t => t.id !== track.id)
    toast.add({ title: 'Track deleted', description: track.title, icon: 'i-lucide-trash-2' })
    toDelete.value = null
  }
  catch (err) {
    toast.add({ title: 'Delete failed', description: getErrorMessage(err), color: 'error' })
  }
  finally {
    deleting.value = false
  }
}
</script>

<template>
  <UContainer class="py-6 sm:py-8">
    <!-- Title and track count -->
    <div class="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">
          Your library
        </h1>
        <p class="text-sm text-muted">
          {{ tracks.length === 1 ? '1 track' : `${tracks.length} tracks` }}
        </p>
      </div>
    </div>

    <!-- The library could not be loaded -->
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Could not load the library"
      :description="getErrorMessage(error)"
      :actions="[{ label: 'Retry', onClick: () => refresh() }]"
      class="mb-6"
    />

    <template v-else-if="status === 'pending' && tracks.length === 0">
      <!-- Loading skeleton -->
      <div class="space-y-3">
        <div
          v-for="n in 6"
          :key="n"
          class="flex items-center gap-3 px-2"
        >
          <USkeleton class="size-12 rounded-md" />
          <div class="flex-1 space-y-2">
            <USkeleton class="h-4 w-1/3" />
            <USkeleton class="h-3 w-1/4" />
          </div>
        </div>
      </div>
    </template>

    <!-- Empty library: invitation to upload -->
    <UEmpty
      v-else-if="tracks.length === 0"
      icon="i-lucide-library"
      title="Your library is empty"
      description="Upload your tracks: title, cover and duration are read from the files automatically."
      :actions="[{ label: 'Upload tracks', icon: 'i-lucide-upload', to: '/tracks/new' }]"
      class="py-16"
    />

    <template v-else>
      <!-- Search, genre and mastering filters, sort order -->
      <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search title, composers, album…"
          class="sm:max-w-xs sm:flex-1"
          aria-label="Search the library"
        />
        <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <USelect
            v-model="genreFilter"
            :items="genreOptions"
            class="w-full sm:w-40"
            aria-label="Filter by genre"
          />
          <USelect
            v-model="masteredFilter"
            :items="masteredOptions"
            class="w-full sm:w-40"
            aria-label="Filter by mastering"
          />
          <USelect
            v-model="sort"
            :items="sortOptions"
            class="col-span-2 w-full sm:w-36"
            aria-label="Sort"
          />
        </div>
      </div>

      <UCard
        :ui="{ body: 'p-0 sm:p-0' }"
        variant="outline"
      >
        <!-- The tracks; playing and deleting are handled here -->
        <TrackList
          v-if="filtered.length"
          :tracks="filtered"
          :genre-name="genreName"
          @play="onPlay"
          @delete="toDelete = $event"
        />
        <!-- Filters match nothing -->
        <UEmpty
          v-else
          icon="i-lucide-search-x"
          title="No results"
          :actions="hasFilters ? [{ label: 'Clear filters', variant: 'subtle', onClick: resetFilters }] : []"
          class="py-12"
        />
      </UCard>
    </template>

    <!-- Delete confirmation -->
    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Delete this track?"
      :description="toDelete ? `“${toDelete.title}” and its files will be permanently deleted.` : undefined"
      confirm-label="Delete"
      :loading="deleting"
      @confirm="confirmDelete"
    />
  </UContainer>
</template>
