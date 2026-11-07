<script setup lang="ts">
/**
 * Library (home page, client-rendered): every track of the user, with
 * search, genre, mastering and version (draft/final) filters and sorting,
 * all applied in the browser (the whole library is loaded at once).
 * Playing a track uses the filtered list as the queue. On phones the four
 * choices sit in a Filters panel opened from beside the search box (in the
 * page they took about a third of the screen), the button counting the
 * active ones; while anything filters the list, the subtitle says how much
 * it shows ("12 of 24 tracks").
 *
 * "Select" turns on selection mode: tick tracks (e.g. the versions of a
 * song), then act on all of them at once: mark as final, add to a
 * playlist, "Share for feedback" (a new unlisted group of versions, listed
 * on the Versions page, whose link is copied), delete. On touch screens a
 * long press on a row turns it on too, with that track ticked; the ✕ that
 * leads the selection bar ends it, within reach where "Done" (at the top)
 * is not once the list is scrolled.
 */
import type { TrackStatus, TrackSummary } from '~~/shared/types/track'
import { playlistsApi, tracksApi } from '~/services/api'
import { feedbackPlaylistTitle } from '~/lib/feedback-playlist'
import { readLibrary } from '~/lib/library-request'

// Browser tab title: "Library · Chronovault".
usePageTitle('Library')

// Playing, and dropping deleted tracks from the queue.
const player = usePlayerStore()
// Delete confirmations and failures.
const toast = useToast()
// The genres, and the name of a genre id (filter and rows).
const { genres, genreName } = useGenres()

// The library (newest first); empty while it loads. Shared with the saved-queue restore when both ask at once.
const { data: tracks, status, error, refresh } = await useAsyncData('tracks', () => readLibrary(), {
  default: () => [] as TrackSummary[],
})

// --- Search and filters ----------------------------------------------------------
const search = ref('')
/** Genre id, or 'all'. */
const genreFilter = ref<string>('all')
/** Mastered tracks only, not mastered only, or both. */
const masteredFilter = ref<'all' | 'yes' | 'no'>('all')
/** Final versions only, drafts only, or both. */
const statusFilter = ref<'all' | TrackStatus>('all')
/** Newest first (as the API returns them) or by title. */
const sort = ref<'recent' | 'title'>('recent')

/** Only genres that at least one track uses. */
const genreOptions = computed(() => [
  { label: 'All genres', value: 'all' },
  ...genres.value
    .filter(g => tracks.value.some(t => t.genreId === g.id))
    .map(g => ({ label: g.name, value: g.id })),
])

/** Tracks matching the search (title, composers, album) and filters, in the chosen order. */
const filtered = computed(() => {
  const q = foldCase(search.value)
  const list = tracks.value.filter((t) => {
    if (genreFilter.value !== 'all' && t.genreId !== genreFilter.value) return false
    if (masteredFilter.value !== 'all' && t.mastered !== (masteredFilter.value === 'yes')) return false
    if (statusFilter.value !== 'all' && t.status !== statusFilter.value) return false
    if (!q) return true
    return [t.title, t.composers, t.album].some(v => v && foldCase(v).includes(q))
  })
  return sort.value === 'title'
    ? [...list].sort((a, b) => a.title.localeCompare(b.title, 'en'))
    : list
})

/** A filter is active: the empty state offers to clear them. */
const hasFilters = computed(() => !!search.value || genreFilter.value !== 'all' || masteredFilter.value !== 'all' || statusFilter.value !== 'all')

/** "Clear filters" (the sort order is kept). */
function resetFilters() {
  search.value = ''
  clearChoices()
}

/** "12 of 24 tracks" while the search or a filter hides some, else "24 tracks". */
const countLabel = computed(() => hasFilters.value
  ? `${filtered.value.length} of ${pluralize(tracks.value.length, 'track')}`
  : pluralize(tracks.value.length, 'track'))

// --- Filters panel (phones) --------------------------------------------------------
/** The Filters panel is open. */
const filtersOpen = ref(false)
// The Android back button closes the panel first.
useCloseOnBack(filtersOpen, () => {
  filtersOpen.value = false
})

/** How many of genre, mastering and version filter the list (the number on the Filters button). */
const activeChoices = computed(() => [genreFilter.value, masteredFilter.value, statusFilter.value].filter(v => v !== 'all').length)

/** The panel's "Clear": genre, mastering and version back to all (the search and the sort order stay). */
function clearChoices() {
  genreFilter.value = 'all'
  masteredFilter.value = 'all'
  statusFilter.value = 'all'
}

// --- Actions ---------------------------------------------------------------------
/** Plays (or toggles) a track; "next"/"previous" follow what is on screen. */
function onPlay(track: TrackSummary) {
  void player.playTrack(track, filtered.value)
}

/** Puts updated tracks in place in the list (same order). */
function replaceTracks(updated: TrackSummary[]) {
  // The updated tracks by id.
  const byId = new Map(updated.map(t => [t.id, t]))
  tracks.value = tracks.value.map(t => byId.get(t.id) ?? t)
}

/**
 * Marks tracks as draft or final (one PATCH each, in parallel). Tracks
 * that fail keep their old status; the toast says how it went.
 */
async function setStatus(ids: string[], status: TrackStatus) {
  // Each update on its own: one failure does not stop the others.
  const results = await Promise.allSettled(ids.map(id => tracksApi.update(id, { status })))
  replaceTracks(results.flatMap(r => (r.status === 'fulfilled' ? [r.value] : [])))
  // How many failed and how many went through.
  const failed = results.filter(r => r.status === 'rejected').length
  const done = ids.length - failed
  // The word for the toasts.
  const what = status === 'final' ? 'final' : 'draft'
  if (done) toast.add({ title: done === 1 ? `Marked as ${what}` : `${pluralize(done, 'track')} marked as ${what}`, icon: 'i-lucide-check', color: 'success' })
  if (failed) toast.add({ title: `${failed} not updated`, description: 'Try again', color: 'error' })
}

// --- Selection mode ----------------------------------------------------------------
/** Checkboxes are shown. */
const selecting = ref(false)
/** Ids of the ticked tracks. */
const selectedIds = ref<string[]>([])
/**
 * The selection bar's actions: on phones an icon over a short name, centred in a column of their
 * own. While selecting, the page leaves room at the bottom (`pb-32`) for the bar fixed there,
 * which would cover the last rows.
 */
const SELECTION_ACTION = 'max-sm:flex-col max-sm:justify-center max-sm:gap-0.5 max-sm:px-1 max-sm:text-xs'

// Only visible tracks stay selected: actions never touch tracks hidden by a filter.
watch(filtered, (list) => {
  // The ids of the tracks the filters show.
  const visible = new Set(list.map(t => t.id))
  selectedIds.value = selectedIds.value.filter(id => visible.has(id))
})

/**
 * The ticked ids as a set: looking each track up in the array (`includes`) cost
 * millions of comparisons after "Select all" on a few thousand tracks, again
 * at every tick.
 */
const selectedSet = computed(() => new Set(selectedIds.value))
/** The ticked tracks, in library order. */
const selectedTracks = computed(() => filtered.value.filter(t => selectedSet.value.has(t.id)))

/** Titles named in the bulk delete question; the rest are counted. */
const DELETE_NAMED = 3
/**
 * The bulk delete question: the first few titles, then how many more (all of
 * them made an unreadable wall of text after "Select all", rebuilt at every tick).
 */
const deleteDescription = computed(() => {
  // The titles named, quoted.
  const named = selectedTracks.value.slice(0, DELETE_NAMED).map(t => `“${t.title}”`).join(', ')
  // How many are left unnamed.
  const rest = selectedTracks.value.length - DELETE_NAMED
  return `${named}${rest > 0 ? ` and ${pluralize(rest, 'other track')}` : ''} will be permanently deleted, with their files.`
})

/** Every visible track is ticked (drives the "select all" checkbox). */
const allSelected = computed(() => filtered.value.length > 0 && selectedIds.value.length === filtered.value.length)

/**
 * The "select all" checkbox's state: ticked, empty, or partly ticked (a dash)
 * when some tracks are. Nuxt UI 4's checkbox takes the partial state as its
 * value, 'indeterminate': it no longer has the `indeterminate` prop the page
 * passed, so with 2 of 24 tracks ticked the box stayed empty (UI-35).
 */
const selectAllState = computed<boolean | 'indeterminate'>(() => {
  if (allSelected.value) return true
  return selectedIds.value.length > 0 ? 'indeterminate' : false
})

/** "Select all" checkbox: ticks every visible track (from empty or partly ticked), or none. */
function toggleAll() {
  selectedIds.value = allSelected.value ? [] : filtered.value.map(t => t.id)
}

/** Leaves selection mode, unticking everything. */
function stopSelecting() {
  selecting.value = false
  selectedIds.value = []
}

/** A long press on a row (touch screens): selection mode on, with that track ticked. */
function selectByLongPress(track: TrackSummary) {
  selecting.value = true
  if (!selectedSet.value.has(track.id)) selectedIds.value = [...selectedIds.value, track.id]
}

// "Add to playlist" of the selection.
const { addToPlaylistMenu } = usePlaylists()
// The Versions page's list, which "Share for feedback" adds to.
const versionGroups = usePlaylistList('versions')
// Shares the group's link: the device's share sheet on touch screens, the clipboard elsewhere.
const { shareLink } = useShareLink()

/** "Add to playlist" menu of the selection: a new playlist, or an existing one. */
const selectionPlaylistMenu = computed(() => addToPlaylistMenu(() => selectedIds.value))

/** Creating the group of versions (spinner on the button). */
const sharing = useAsyncTask()

/**
 * "Share for feedback": a new unlisted group of versions (a playlist whose
 * purpose is 'versions', kept apart from the curated playlists) with the selected
 * tracks, named after them ("Night drive – versions"), and its link shared
 * (the share sheet on touch screens, copied elsewhere; if the sheet is
 * refused because the request took too long after the tap, it is copied).
 * Friends open one link and hear every version in a row, drafts marked
 * "Work in progress".
 */
async function shareForFeedback() {
  // The selected tracks, in library order.
  const chosen = selectedTracks.value
  if (!chosen.length) return
  await sharing.run(async () => {
    // The new group, unlisted, with the selected tracks.
    const playlist = await playlistsApi.create({
      title: feedbackPlaylistTitle(chosen.map(t => t.title)),
      purpose: 'versions',
      visibility: 'unlisted',
      trackIds: chosen.map(t => t.id),
    })
    // The Versions page sees it at once.
    versionGroups.remember(playlist)
    await shareLink(playlist.id, 'playlist', playlist.title)
    stopSelecting()
  }, 'Could not create the group of versions')
}

/** The bulk delete confirmation is open. */
const bulkDeleteOpen = ref(false)
/** The bulk delete is running (spinner in the dialog). */
const bulkDeleting = ref(false)

/**
 * Deletes every selected track (one request each, in parallel). Deleted
 * tracks leave the list and the player queue; failures stay selected so
 * they can be retried.
 */
async function confirmBulkDelete() {
  // The selected tracks, in library order.
  const chosen = selectedTracks.value
  bulkDeleting.value = true
  // Each deletion on its own: one failure does not stop the others.
  const results = await Promise.allSettled(chosen.map(t => tracksApi.remove(t.id)))
  // The ids that were deleted, as a set: the library and the queue are each filtered in one pass
  // (looking each track up in a list cost millions of comparisons for a few thousand tracks).
  const deleted = new Set(chosen.filter((_, i) => results[i]!.status === 'fulfilled').map(t => t.id))
  player.removeTracks(deleted)
  tracks.value = tracks.value.filter(t => !deleted.has(t.id))
  bulkDeleting.value = false
  bulkDeleteOpen.value = false
  // How many could not be deleted.
  const failed = chosen.length - deleted.size
  if (deleted.size) toast.add({ title: deleted.size === 1 ? 'Track deleted' : `${pluralize(deleted.size, 'track')} deleted`, icon: 'i-lucide-trash-2' })
  if (failed) toast.add({ title: `${failed} not deleted`, description: 'They are still selected: try again', color: 'error' })
  else stopSelecting()
}

/** Track waiting for the delete confirmation (the dialog is open while set). */
const toDelete = ref<TrackSummary | null>(null)
/** The delete request (spinner in the dialog). */
const deleting = useAsyncTask()
/** The confirmation dialog is open while a track is waiting to be deleted; closing it cancels. */
const deleteOpen = computed({
  get: () => toDelete.value !== null,
  set: (open) => {
    if (!open) toDelete.value = null
  },
})

/** Deletes the track, drops it from the player queue and from the list. */
async function confirmDelete() {
  // The track the confirmation dialog is about.
  const track = toDelete.value
  if (!track) return
  await deleting.run(async () => {
    await tracksApi.remove(track.id)
    player.removeTrack(track.id)
    tracks.value = tracks.value.filter(t => t.id !== track.id)
    toast.add({ title: 'Track deleted', description: track.title, icon: 'i-lucide-trash-2' })
    toDelete.value = null
  }, 'Delete failed')
}
</script>

<template>
  <UContainer
    class="py-6 sm:py-8"
    :class="{ 'max-sm:pb-32': selecting }"
  >
    <!-- Title, track count and the selection mode switch -->
    <div class="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">
          Your library
        </h1>
        <p
          class="text-sm text-muted"
          data-testid="library-count"
        >
          {{ countLabel }}
        </p>
      </div>
      <UButton
        v-if="tracks.length"
        :label="selecting ? 'Done' : 'Select'"
        :icon="selecting ? 'i-lucide-x' : 'i-lucide-list-checks'"
        color="neutral"
        variant="subtle"
        data-testid="select-mode"
        @click="selecting ? stopSelecting() : (selecting = true)"
      />
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
      <!--
        Search, genre and mastering filters, sort order. One row only from `xl`: the filters have
        fixed widths, and below that the search box got what they left, down to its icon alone
        (58px) at 640px. Below `xl` the search box has a row of its own, the filters four across
        under it. On phones, where they took about a third of the screen, they move into the
        Filters panel (below), opened by a button beside the search box.
      -->
      <div class="mb-4 flex flex-col gap-2 xl:flex-row xl:items-center">
        <!-- The search box, and the Filters button on phones (with the number of active filters) -->
        <div class="flex gap-2 xl:contents">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Search title, composers, album…"
            class="min-w-0 flex-1 xl:max-w-xs"
            aria-label="Search the library"
          />
          <UButton
            icon="i-lucide-sliders-horizontal"
            label="Filters"
            color="neutral"
            variant="outline"
            :aria-label="activeChoices ? `Filters, ${activeChoices} active` : 'Filters'"
            class="md:hidden"
            data-testid="filters-open"
            @click="filtersOpen = true"
          >
            <template
              v-if="activeChoices"
              #trailing
            >
              <UBadge
                :label="activeChoices"
                size="sm"
                data-testid="filters-count"
              />
            </template>
          </UButton>
        </div>
        <LibraryFilters
          v-model:genre="genreFilter"
          v-model:mastered="masteredFilter"
          v-model:status="statusFilter"
          v-model:sort="sort"
          :genre-options="genreOptions"
          class="hidden gap-2 md:grid md:grid-cols-4 xl:flex xl:flex-wrap"
        />
      </div>

      <!-- Phones: the filters and the sort order in a panel from the bottom of the screen -->
      <USlideover
        v-model:open="filtersOpen"
        side="bottom"
        title="Filters"
        description="Genre, mastering, version and sort order."
        :ui="{ footer: 'pb-[max(1rem,env(safe-area-inset-bottom))]' }"
      >
        <template #body>
          <LibraryFilters
            v-model:genre="genreFilter"
            v-model:mastered="masteredFilter"
            v-model:status="statusFilter"
            v-model:sort="sort"
            :genre-options="genreOptions"
            class="grid gap-3"
          />
        </template>
        <!-- Clear, and back to the list with what it now holds -->
        <template #footer>
          <UButton
            label="Clear"
            color="neutral"
            variant="ghost"
            :disabled="!activeChoices"
            data-testid="filters-clear"
            @click="clearChoices"
          />
          <UButton
            :label="`Show ${pluralize(filtered.length, 'track')}`"
            class="ml-auto"
            data-testid="filters-done"
            @click="filtersOpen = false"
          />
        </template>
      </USlideover>

      <!--
        Selection bar: count, select all, and the actions on the ticked tracks. From `sm` it stays
        under the header while scrolling, the actions named beside their icons. On phones it is
        fixed at the bottom of the screen (above the player bar), within reach of the thumb, each
        action an icon over a short name: tooltips do not open on touch, and the bare icons left
        "Mark final" and "Share for feedback" to be guessed.
      -->
      <div
        v-if="selecting"
        class="fixed inset-x-0 bottom-(--above-player) z-20 flex flex-col gap-1 border-t border-default bg-default/95 px-3 pt-2 pb-1 backdrop-blur sm:sticky sm:top-14 sm:bottom-auto sm:mb-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:rounded-lg sm:border sm:py-2"
        data-testid="selection-bar"
      >
        <div class="flex min-w-0 items-center gap-3">
          <!-- Ends selection mode, like "Done" in the header, but within reach on phones -->
          <IconButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            label="End selection"
            class="-ml-1.5"
            data-testid="selection-close"
            @click="stopSelecting"
          />
          <UCheckbox
            :model-value="selectAllState"
            aria-label="Select all"
            @update:model-value="toggleAll"
          />
          <span
            class="truncate text-sm"
            data-testid="selection-count"
          >{{ selectedIds.length }} selected</span>
        </div>
        <!-- Four equal columns on phones, a row of buttons from `sm` -->
        <div class="grid grid-cols-4 sm:flex sm:items-center sm:gap-1">
          <UButton
            icon="i-lucide-circle-check"
            color="neutral"
            variant="ghost"
            :class="SELECTION_ACTION"
            :disabled="!selectedIds.length"
            aria-label="Mark as final"
            data-testid="bulk-final"
            @click="setStatus(selectedIds, 'final')"
          >
            <span class="sm:hidden">Final</span>
            <span class="hidden sm:inline">Mark final</span>
          </UButton>
          <UDropdownMenu
            :items="selectionPlaylistMenu"
            :content="{ align: 'end' }"
            :disabled="!selectedIds.length"
          >
            <UButton
              icon="i-lucide-list-plus"
              color="neutral"
              variant="ghost"
              :class="SELECTION_ACTION"
              :disabled="!selectedIds.length"
              aria-label="Add to playlist"
            >
              <span class="sm:hidden">Playlist</span>
              <span class="hidden sm:inline">Add to playlist</span>
            </UButton>
          </UDropdownMenu>
          <UButton
            icon="i-lucide-messages-square"
            color="neutral"
            variant="ghost"
            :class="SELECTION_ACTION"
            :loading="sharing.running"
            :disabled="!selectedIds.length"
            aria-label="Share for feedback"
            data-testid="bulk-feedback"
            @click="shareForFeedback"
          >
            <span class="sm:hidden">Feedback</span>
            <span class="hidden sm:inline">Share for feedback</span>
          </UButton>
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            :class="SELECTION_ACTION"
            :disabled="!selectedIds.length"
            aria-label="Delete selected"
            data-testid="bulk-delete"
            @click="bulkDeleteOpen = true"
          >
            Delete
          </UButton>
        </div>
      </div>

      <UCard
        :ui="{ body: 'p-0 sm:p-0' }"
        variant="outline"
      >
        <!-- The tracks; playing, deleting, status changes and selection are handled here -->
        <TrackList
          v-if="filtered.length"
          v-model:selected="selectedIds"
          :tracks="filtered"
          :genre-name="genreName"
          :selectable="selecting"
          @select="selectByLongPress"
          @play="onPlay"
          @delete="toDelete = $event"
          @status="(track, status) => setStatus([track.id], status)"
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
      :loading="deleting.running"
      @confirm="confirmDelete"
    />

    <!-- Bulk delete confirmation (selection mode) -->
    <ConfirmDialog
      v-model:open="bulkDeleteOpen"
      :title="selectedIds.length === 1 ? 'Delete this track?' : `Delete ${selectedIds.length} tracks?`"
      :description="deleteDescription"
      confirm-label="Delete"
      :loading="bulkDeleting"
      @confirm="confirmBulkDelete"
    />
  </UContainer>
</template>
