<script setup lang="ts">
import type { DropdownMenuItem, FormSubmitEvent } from '@nuxt/ui'
import type { PlaylistDetail, PlaylistPurpose, VersionFeedback, VersionTally } from '~~/shared/types/playlist'
import type { TrackStatus, TrackSummary } from '~~/shared/types/track'
import { playlistMetadataSchema, type PlaylistMetadata, type PlaylistMetadataInput } from '~~/shared/schemas/playlist'
import { buildPlaylistCoverPath } from '~~/shared/utils/storage-paths'
import { playlistsApi, tracksApi } from '~/services/api'
import { getErrorMessage } from '~/utils/errors'

/**
 * Owner page of a playlist or of a group of versions (client-rendered),
 * shown by pages/playlists/[id].vue and pages/versions/[id].vue: details
 * form (title, description, visibility), the track list (drag to reorder,
 * Move up/down, remove, click to play), Play all, cover (custom or mosaic),
 * sharing box (with a warning when private tracks are included) and deletion.
 * Track list changes save immediately; the details form saves with "Save".
 *
 * Both purposes work the same way; a group of versions only words things
 * differently ("versions", "group"), lets each version be marked final
 * or draft from its menu, since picking one is what the group is for, and
 * shows the friends' feedback (votes, plays, notes: PlaylistVersionFeedback),
 * the new ones marked; leaving the page records the visit, so they stop
 * being new (see "New feedback" below).
 * Opened under the other purpose's address (e.g. an old /playlists/:id link of
 * a group), the page moves to the right one.
 */
const props = defineProps<{
  /** Playlist id (from the route). */
  id: string
  /** The purpose this address is for (/playlists → 'playlist', /versions → 'versions'). */
  purpose: PlaylistPurpose
}>()

// Play all, the highlighted current track, click-to-play rows.
const player = usePlayerStore()
// Success and failure messages.
const toast = useToast()
// Keeps the cached list of the Playlists (or Versions) page in sync with changes made here.
const { remember, forget } = usePlaylistList(props.purpose)
// "Play next" / "Add to queue" in each track's menu.
const queue = useQueueActions()
// "Download" in each track's menu: the file with its metadata written in.
const { download } = useTrackDownload()

const { data: playlist, error } = await useAsyncData(`playlist-${props.id}`, () => playlistsApi.get(props.id))

// Missing or someone else's playlist: the error page (404).
if (error.value || !playlist.value) {
  throw createError({ statusCode: error.value?.statusCode ?? 404, message: 'Playlist not found', fatal: true })
}

// Wrong section for this purpose: same page, under its own address.
if (playlist.value.purpose !== props.purpose) {
  await navigateTo(playlistPath(playlist.value), { replace: true })
}

/** Words and addresses of this purpose (section, "playlist"/"group", "track"/"version"). */
const info = PLAYLIST_PURPOSE_INFO[props.purpose]
/** The page is a group of versions (Final badges, Mark as final/draft). */
const isVersions = props.purpose === 'versions'

// Browser tab title: follows renames ("Night drive – versions · Chronovault").
usePageTitle(() => playlist.value?.title ?? info.section)

/** Tracks in their current order (reordered locally, then saved). */
const tracks = ref<TrackSummary[]>([...playlist.value.tracks])

/** Adopts the playlist returned by the server after any change (the server's copy wins). */
function applyServerPlaylist(updated: PlaylistDetail) {
  playlist.value = updated
  tracks.value = [...updated.tracks]
  remember(updated)
}

// --- Details form -------------------------------------------------------------------
/** Form fields: the description is a string while editing ('' = none), null once validated. */
type FormState = Omit<PlaylistMetadataInput, 'description'> & { description: string }

/** Server data → form state. */
function toFormState(p: PlaylistDetail): FormState {
  return { title: p.title, description: p.description ?? '', visibility: p.visibility }
}

/** The details form, its unsaved changes and the leave-page warning. */
const form = useEditForm<FormState>(toFormState(playlist.value))
const { state, dirty } = form
/** The save request (spinner on "Save"). */
const saving = useAsyncTask()

/** Saves title, description and visibility (validated by UForm with the shared schema). */
async function onSubmit(event: FormSubmitEvent<PlaylistMetadata>) {
  const saved = await saving.run(async () => {
    const updated = await playlistsApi.update(props.id, event.data)
    applyServerPlaylist(updated)
    // The form takes the normalized values back and is clean again.
    form.reset(toFormState(updated))
  }, 'Save failed')
  if (saved) toast.add({ title: 'Changes saved', icon: 'i-lucide-check', color: 'success' })
}

/** Description placeholder: a group's description is the note its listeners read. */
const descriptionPlaceholder = isVersions
  ? 'A note for your listeners, e.g. “Which one do you prefer?”'
  : 'What is this playlist about?'

// --- Tracks: play, reorder, remove ------------------------------------------------------
/**
 * The player is on one of these tracks, started from the app (not a share page):
 * "Play all" then pauses/resumes instead of starting over.
 */
const isPlayingHere = computed(() => player.sourceKey === 'library' && tracks.value.some(t => t.id === player.current?.id))

/** The track is the one loaded in the player (highlighted row). */
function isCurrent(track: TrackSummary) {
  return player.current?.id === track.id
}

/** "Play all": pause/resume when this playlist is playing, otherwise start it (from a random track while shuffled). */
function playAll() {
  if (isPlayingHere.value) void player.togglePlay()
  else void player.playAll(tracks.value)
}

/** A reorder/removal is being saved (spinner next to the list heading). */
const savingOrder = ref(false)

/**
 * Saves a new track list (order or removal) right away. The list updates
 * first (optimistic); if the request fails it goes back to the saved one.
 */
async function saveTracks(next: TrackSummary[], failureTitle: string) {
  const previous = playlist.value!.tracks
  tracks.value = next
  savingOrder.value = true
  try {
    applyServerPlaylist(await playlistsApi.setTracks(props.id, next.map(t => t.id)))
    // A removed version takes its votes and plays out of the feedback.
    void loadFeedback()
  }
  catch (err) {
    tracks.value = [...previous]
    toast.add({ title: failureTitle, description: getErrorMessage(err), color: 'error' })
  }
  finally {
    savingOrder.value = false
  }
}

/** "Move up/down": swaps the track with its neighbour and saves. */
function move(index: number, offset: number) {
  const target = index + offset
  if (target < 0 || target >= tracks.value.length) return
  void saveTracks(moveItem(tracks.value, index, target), 'Order not saved')
}

/** "Remove from playlist/group" (the track stays in the library). */
function removeTrack(track: TrackSummary) {
  void saveTracks(tracks.value.filter(t => t.id !== track.id), `${capitalize(info.trackNoun)} not removed`)
}

/**
 * "Mark as final / draft" (groups of versions): the track's own status, the
 * same switch as in the library. Only the row changes: the list order and
 * the group stay as they are.
 */
async function setStatus(track: TrackSummary, status: TrackStatus) {
  try {
    const updated = await tracksApi.update(track.id, { status })
    const withStatus = (t: TrackSummary) => (t.id === track.id ? { ...t, status: updated.status } : t)
    tracks.value = tracks.value.map(withStatus)
    playlist.value = { ...playlist.value!, tracks: playlist.value!.tracks.map(withStatus) }
    toast.add({ title: `Marked as ${status}`, icon: 'i-lucide-check', color: 'success' })
    // A final version closes the voting (a draft again reopens it).
    void loadFeedback()
  }
  catch (err) {
    toast.add({ title: 'Status not changed', description: getErrorMessage(err), color: 'error' })
  }
}

/** The "⋮" menu of a track row: queue actions, move, (final/draft,) edit, remove. */
function menuFor(track: TrackSummary, index: number): DropdownMenuItem[][] {
  return [
    queue.menuItems(track),
    [
      { label: 'Move up', icon: 'i-lucide-arrow-up', disabled: index === 0, onSelect: () => move(index, -1) },
      { label: 'Move down', icon: 'i-lucide-arrow-down', disabled: index === tracks.value.length - 1, onSelect: () => move(index, 1) },
    ],
    // Picking the version to keep is what a group is for.
    ...(isVersions
      ? [[track.status === 'draft'
          ? { label: 'Mark as final', icon: 'i-lucide-circle-check', onSelect: () => void setStatus(track, 'final') }
          : { label: 'Mark as draft', icon: 'i-lucide-flask-conical', onSelect: () => void setStatus(track, 'draft') }]]
      : []),
    [
      { label: 'Edit track', icon: 'i-lucide-pencil', to: `/tracks/${track.id}/edit` },
      { label: 'Download', icon: 'i-lucide-download', onSelect: () => void download(track.id) },
    ],
    [{ label: `Remove from ${info.noun}`, icon: 'i-lucide-list-x', color: 'error', onSelect: () => removeTrack(track) }],
  ]
}

// --- Feedback (groups of versions) ---------------------------------------------------
/** Votes, visitors' plays and notes of the group; null for a playlist, or until loaded. */
const feedback = ref<VersionFeedback | null>(null)

/** (Re)loads the feedback of a group; a failure just leaves the panel out. */
async function loadFeedback() {
  if (!isVersions) return
  try {
    feedback.value = await playlistsApi.feedback(props.id)
  }
  catch {
    feedback.value = null
  }
}
onMounted(loadFeedback)

// --- New feedback: seen when the owner leaves the group ---------------------------------
// Opening the group drops its badge and its share of the header's dot at once; the
// server learns of the visit only when the owner leaves (page closed, hidden or left
// for another one), so the comments that were new keep their "New" mark for the whole
// visit, even when the feedback reloads. The visit covers what was on screen: the group
// is seen up to when its feedback was last read (`asOf`), so a vote that arrived while
// the owner looked at an older copy stays new. Groups only: playlists get no votes.
const unseenFeedback = isVersions ? useUnseenFeedback() : null
onMounted(() => unseenFeedback?.clearLocally(props.id))
/** Records the visit (idempotent: hiding the page and then leaving it sends it twice, harmlessly). */
function markFeedbackSeen() {
  // No feedback on screen (not loaded, or failed): nothing was seen.
  if (feedback.value) void unseenFeedback?.markSeen(props.id, feedback.value.asOf)
}
onBeforeUnmount(markFeedbackSeen)
// Hidden (another tab or app, the phone locked) or closed: the visit counts as done.
useEventListener(document, 'visibilitychange', () => {
  if (document.visibilityState === 'hidden') markFeedbackSeen()
})
useEventListener(window, 'pagehide', markFeedbackSeen)

/** A version's votes and plays, for the line under its title (null: no feedback loaded). */
function tallyOf(track: TrackSummary): VersionTally | null {
  return feedback.value?.versions.find(v => v.trackId === track.id) ?? null
}

// Drag and drop (mouse and touch) through the handle of each row; the new order saves at once.
const listEl = ref<HTMLElement | null>(null)
useSortableList(listEl, tracks, () => void saveTracks([...tracks.value], 'Order not saved'))

// --- Cover -----------------------------------------------------------------------------
// Custom cover: picked and cropped → `<userId>/playlists/<id>.webp` → PATCH coverPath.
// Removing it brings the mosaic of the first track covers back.
const cover = useCoverEditor({
  path: userId => buildPlaylistCoverPath(userId, props.id),
  save: async coverPath => applyServerPlaylist(await playlistsApi.update(props.id, { coverPath })),
})

// --- Sharing (based on the saved visibility) -------------------------------------------
/** Saved visibility is unlisted/public: show the share link (a change applies once saved). */
const isShared = computed(() => playlist.value?.visibility !== 'private')

// --- Deletion ----------------------------------------------------------------------------
/** The delete confirmation dialog. */
const deleteOpen = ref(false)
/** The delete request (spinner in the dialog). */
const deleting = useAsyncTask()

/** Deletes the playlist (tracks stay in the library) and goes back to its list page. */
async function onDelete() {
  const deleted = await deleting.run(async () => {
    await playlistsApi.remove(props.id)
    forget(props.id)
  }, 'Delete failed')
  if (!deleted) return
  // No "unsaved changes" warning when leaving a deleted playlist.
  form.markSaved()
  deleteOpen.value = false
  toast.add({ title: `${capitalize(info.noun)} deleted`, icon: 'i-lucide-trash-2' })
  await navigateTo(info.path)
}
</script>

<template>
  <UContainer
    v-if="playlist"
    class="max-w-5xl py-6 sm:py-8"
  >
    <!-- Header: back, title, Play all, Save -->
    <div class="mb-6 flex flex-wrap items-center gap-2">
      <IconButton
        :to="info.path"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        :label="`Back to ${info.section.toLowerCase()}`"
      />
      <h1
        class="min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight"
        data-testid="playlist-title"
      >
        {{ playlist.title }}
      </h1>
      <UButton
        :icon="isPlayingHere && player.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
        :label="isPlayingHere && player.isPlaying ? 'Pause' : 'Play all'"
        :disabled="!tracks.length"
        color="neutral"
        variant="subtle"
        data-testid="playlist-play"
        @click="playAll"
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

    <div class="grid gap-8 md:grid-cols-[16rem_1fr]">
      <!-- Side column: cover, stats, sharing, deletion -->
      <aside class="space-y-6">
        <TrackCoverPicker
          :url="playlist.coverUrl"
          :title="playlist.title"
          :busy="cover.busy"
          @select="cover.select"
          @remove="cover.remove"
        >
          <template #preview>
            <PlaylistCover
              :url="playlist.coverUrl"
              :mosaic="playlist.mosaic"
              :title="playlist.title"
              rounded="rounded-lg"
              class="w-full"
            />
          </template>
        </TrackCoverPicker>
        <!-- No custom cover: explains where the mosaic comes from -->
        <p
          v-if="!playlist.coverUrl"
          class="-mt-3 text-xs text-muted"
        >
          Without a cover of its own, the {{ info.noun }} shows the covers of its first {{ info.trackNoun }}s.
        </p>

        <!-- Track count and total duration -->
        <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <dt class="text-muted">
            {{ capitalize(info.trackNoun) }}s
          </dt>
          <dd class="text-right tabular-nums">
            {{ playlist.trackCount }}
          </dd>
          <dt class="text-muted">
            Duration
          </dt>
          <dd class="text-right tabular-nums">
            {{ formatTime(playlist.durationSeconds) }}
          </dd>
        </dl>

        <!-- Sharing: link and warning about private tracks, or how to share -->
        <ShareLinkBox
          :id="id"
          kind="playlist"
          :shared="isShared"
          :title="playlist?.title"
        >
          <!-- Sharing a playlist shares its private tracks too (only inside it) -->
          <UAlert
            v-if="playlist.privateTrackCount > 0"
            color="warning"
            variant="subtle"
            icon="i-lucide-lock-open"
            :title="`${pluralize(playlist.privateTrackCount, `private ${info.trackNoun}`)} included`"
            :description="`They can be heard through this link, but only inside the ${info.noun}.`"
            data-testid="private-tracks-warning"
          />
        </ShareLinkBox>

        <!-- Deletion (asks for confirmation first) -->
        <UButton
          :label="`Delete ${info.noun}`"
          icon="i-lucide-trash-2"
          color="error"
          variant="soft"
          block
          @click="deleteOpen = true"
        />
      </aside>

      <!-- Main column: details form, then the track list -->
      <div class="min-w-0 space-y-8">
        <!-- Details form, validated with the shared schema; the header's Save submits it -->
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

          <!-- Description: shown on the public page (a group's note to its listeners) -->
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
              orientation="horizontal"
              variant="card"
              class="w-full"
            />
          </UFormField>
        </UForm>

        <section>
          <!-- Track list: drag handle, cover, title (click to play), duration, menu -->
          <!-- Heading ("Tracks" / "Versions") and the spinner while a change saves -->
          <div class="mb-2 flex items-center justify-between gap-2">
            <h2 class="text-xs font-semibold uppercase tracking-widest text-muted">
              {{ capitalize(info.trackNoun) }}s
            </h2>
            <UIcon
              v-if="savingOrder"
              name="i-lucide-loader-circle"
              class="size-4 animate-spin text-muted"
            />
          </div>

          <!-- Empty: playlists are filled from the library's menus, groups by "Share for feedback" -->
          <UEmpty
            v-if="!tracks.length"
            icon="i-lucide-list-plus"
            :title="`No ${info.trackNoun}s yet`"
            :description="isVersions
              ? 'In the library, select the versions of a song and use “Share for feedback”.'
              : 'Add tracks from the library with “Add to playlist” in their menu.'"
            :actions="[{ label: 'Go to library', to: '/', icon: 'i-lucide-library' }]"
          />

          <!-- Always in the DOM (v-show): drag and drop binds to it once, on mount. -->
          <ol
            v-show="tracks.length"
            ref="listEl"
            class="divide-y divide-default rounded-lg border border-default"
          >
            <!-- One row per track; the one in the player is highlighted -->
            <li
              v-for="(track, index) in tracks"
              :key="track.id"
              class="flex items-center gap-2 px-2 py-2 sm:gap-3"
              :class="{ 'bg-primary/5': isCurrent(track) }"
              data-testid="playlist-track"
            >
              <!-- Drag to reorder (mouse or touch) -->
              <DragHandle />
              <TrackCover
                :url="track.coverUrl"
                :title="track.title"
                class="size-10"
              />
              <!-- Title and composers: click to play (or pause/resume the current one) -->
              <button
                type="button"
                class="min-w-0 flex-1 cursor-pointer text-left"
                data-testid="playlist-track-title"
                @click="isCurrent(track) ? player.togglePlay() : player.playTrack(track, tracks)"
              >
                <span
                  class="flex items-center gap-1.5 truncate font-medium"
                  :class="{ 'text-primary': isCurrent(track) }"
                >
                  <span class="truncate">{{ track.title }}</span>
                  <!-- Private tracks become audible when the playlist is shared -->
                  <UIcon
                    v-if="track.visibility === 'private'"
                    name="i-lucide-lock"
                    class="size-3.5 shrink-0 text-dimmed"
                    aria-label="Private track"
                  />
                  <!-- Work in progress (e.g. one of several versions) -->
                  <UBadge
                    v-if="track.status === 'draft'"
                    label="Draft"
                    color="warning"
                    variant="subtle"
                    size="sm"
                    class="shrink-0"
                  />
                  <!-- In a group, the chosen version stands out -->
                  <UBadge
                    v-else-if="isVersions"
                    label="Final"
                    color="success"
                    variant="subtle"
                    size="sm"
                    class="shrink-0"
                    data-testid="version-final"
                  />
                </span>
                <span class="block truncate text-sm text-muted">{{ track.composers || '—' }}</span>
                <!-- Groups: the friends' votes and plays of this version -->
                <span
                  v-if="tallyOf(track)"
                  class="flex items-center gap-3 text-xs tabular-nums text-muted"
                  data-testid="version-tally"
                >
                  <span class="flex items-center gap-1">
                    <UIcon
                      name="i-lucide-heart"
                      class="size-3"
                    />{{ pluralize(tallyOf(track)!.votes, 'vote') }}
                  </span>
                  <span class="flex items-center gap-1">
                    <UIcon
                      name="i-lucide-headphones"
                      class="size-3"
                    />{{ pluralize(tallyOf(track)!.plays, 'play') }}, {{ tallyOf(track)!.completed }} to the end
                  </span>
                </span>
              </button>
              <!-- Duration (hidden on phones) -->
              <span class="hidden text-sm tabular-nums text-muted sm:block">
                {{ formatTime(track.durationSeconds) }}
              </span>
              <!-- "⋮" menu: queue, move, final/draft (groups), edit, download, remove -->
              <UDropdownMenu
                :items="menuFor(track, index)"
                :content="{ align: 'end' }"
              >
                <IconButton
                  icon="i-lucide-ellipsis-vertical"
                  color="neutral"
                  variant="ghost"
                  :label="`Actions for ${track.title}`"
                />
              </UDropdownMenu>
            </li>
          </ol>
        </section>

        <!-- Groups: what the friends who got the link think -->
        <PlaylistVersionFeedback
          v-if="feedback && tracks.length"
          :feedback="feedback"
          :tracks="tracks"
        />
      </div>
    </div>

    <!-- Delete confirmation: the tracks themselves stay in the library -->
    <ConfirmDialog
      v-model:open="deleteOpen"
      :title="`Delete this ${info.noun}?`"
      :description="`The ${info.noun} and its link are removed. Its ${info.trackNoun}s stay in your library.`"
      confirm-label="Delete"
      :loading="deleting.running"
      @confirm="onDelete"
    />
  </UContainer>
</template>
