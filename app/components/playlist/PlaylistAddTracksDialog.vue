<script setup lang="ts">
import type { PlaylistPurpose } from '~~/shared/types/playlist'
import type { TrackSummary } from '~~/shared/types/track'
import { isVersionOf } from '~/lib/feedback-playlist'
import { readLibrary } from '~/lib/library-request'
import { getErrorMessage } from '~/utils/errors'

/**
 * "Add versions" / "Add tracks" on a playlist's or group's page: the library
 * in a dialog, searched by title, composers or album, the tracks already in
 * it left out; a group is offered drafts only, the search starting from its
 * song's name (`suggestion`) while that song has a draft left to add. The ticked ones go back to the editor (`add`), which appends
 * them through its own save queue, so they never race a reorder or a removal.
 */
const props = defineProps<{
  /** What is being filled: its words ("versions", "group"). */
  purpose: PlaylistPurpose
  /** The tracks already in it: not offered. */
  excludeIds: string[]
  /** What the search starts from at each opening, when it finds something (a group: its song's name). */
  suggestion?: string
}>()

const emit = defineEmits<{
  /** The ticked tracks, in library order. */
  add: [tracks: TrackSummary[]]
}>()

const open = defineModel<boolean>('open', { required: true })

/**
 * Rows drawn at most: a library of thousands in a dialog would take seconds
 * to draw, and nobody scrolls that far to pick a track. The search narrows it.
 */
const SHOWN = 100

const info = computed(() => PLAYLIST_PURPOSE_INFO[props.purpose])
/** The library, read at each opening (an upload since the last one shows up). */
const library = ref<TrackSummary[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)
const search = ref('')
const picked = ref<string[]>([])
const pickedSet = computed(() => new Set(picked.value))
/** Touch screens: the search box waits for a tap, or the keyboard would open over the list at once. */
const touchPointer = useMediaQuery('(pointer: coarse)')

// The Android back button closes it, as every dialog.
useCloseOnBack(open, () => {
  open.value = false
})

watch(open, async (value) => {
  if (!value) return
  search.value = ''
  picked.value = []
  loadError.value = null
  loading.value = true
  try {
    library.value = await readLibrary()
    // A search that finds nothing would read as an empty library: the song's name only when
    // one of its tracks is left to add.
    const song = props.suggestion
    if (song && offered.value.some(t => isVersionOf(t.title, song))) search.value = song
  }
  catch (err) {
    loadError.value = getErrorMessage(err)
  }
  finally {
    loading.value = false
  }
})

/** Only drafts can join a group: a final track is a version already chosen, not one to vote on. */
const draftsOnly = computed(() => props.purpose === 'versions')

/** Library tracks not in it yet (drafts only, for a group). */
const offered = computed(() => {
  const inside = new Set(props.excludeIds)
  return library.value.filter(t => !inside.has(t.id) && (!draftsOnly.value || t.status === 'draft'))
})

/** Offered tracks matching the search, the same fields as the library's search box. */
const matches = computed(() => {
  const q = foldCase(search.value)
  if (!q) return offered.value
  return offered.value.filter(t => [t.title, t.composers, t.album].some(v => v && foldCase(v).includes(q)))
})

const shown = computed(() => matches.value.slice(0, SHOWN))

function toggle(track: TrackSummary) {
  picked.value = pickedSet.value.has(track.id)
    ? picked.value.filter(id => id !== track.id)
    : [...picked.value, track.id]
}

function confirm() {
  // In library order, whatever order they were ticked in, like the selection bar's actions.
  emit('add', offered.value.filter(t => pickedSet.value.has(t.id)))
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="`Add ${info.trackNoun}s`"
    :description="draftsOnly
      ? `Drafts from your library, added at the end of the ${info.noun}.`
      : `Tracks from your library, added at the end of the ${info.noun}.`"
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <template #body>
      <div class="border-b border-default p-4">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search title, composers, album"
          :autofocus="!touchPointer"
          class="w-full"
          aria-label="Search the library"
          data-testid="add-tracks-search"
        />
      </div>

      <div
        v-if="loading"
        class="flex justify-center p-8"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-6 animate-spin text-muted"
        />
      </div>
      <p
        v-else-if="loadError"
        class="p-6 text-center text-sm text-error"
      >
        {{ loadError }}
      </p>
      <p
        v-else-if="!matches.length"
        class="p-6 text-center text-sm text-muted"
        data-testid="add-tracks-empty"
      >
        {{ offered.length
          ? 'No track matches the search.'
          : draftsOnly
            ? `Every draft of your library is already in this ${info.noun}.`
            : `Every track of your library is already in this ${info.noun}.` }}
      </p>
      <!-- Tracks to tick: the whole row is the checkbox's label, an easy target on phones -->
      <ul
        v-else
        class="max-h-[50dvh] divide-y divide-default overflow-y-auto"
      >
        <li
          v-for="track in shown"
          :key="track.id"
        >
          <label
            class="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-elevated/50"
            data-testid="add-tracks-option"
          >
            <UCheckbox
              :model-value="pickedSet.has(track.id)"
              :aria-label="track.title"
              @update:model-value="toggle(track)"
            />
            <TrackCover
              :url="track.coverUrl"
              :title="track.title"
              class="size-9"
            />
            <span class="min-w-0 flex-1">
              <span class="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                <span class="truncate">{{ track.title }}</span>
                <UBadge
                  v-if="track.status === 'draft'"
                  label="Draft"
                  color="warning"
                  variant="subtle"
                  size="sm"
                  class="shrink-0"
                />
              </span>
              <span class="block truncate text-xs text-muted">{{ track.composers || '—' }}</span>
            </span>
            <span class="hidden text-xs tabular-nums text-muted sm:block">{{ formatTime(track.durationSeconds) }}</span>
          </label>
        </li>
        <li
          v-if="matches.length > SHOWN"
          class="px-4 py-3 text-center text-xs text-muted"
        >
          {{ SHOWN }} of {{ matches.length }} shown: search to narrow them down.
        </li>
      </ul>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="open = false"
        />
        <UButton
          icon="i-lucide-list-plus"
          :disabled="!picked.length"
          data-testid="add-tracks-confirm"
          @click="confirm"
        >
          {{ picked.length ? `Add ${pluralize(picked.length, info.trackNoun)}` : `Add ${info.trackNoun}s` }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
