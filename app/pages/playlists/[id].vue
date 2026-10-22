<script setup lang="ts">
import type { DropdownMenuItem, FormSubmitEvent } from '@nuxt/ui'
import type { PlaylistDetail } from '~~/shared/types/playlist'
import type { TrackSummary } from '~~/shared/types/track'
import { playlistMetadataSchema, type PlaylistMetadata, type PlaylistMetadataInput } from '~~/shared/schemas/playlist'
import { buildPlaylistCoverPath } from '~~/shared/utils/storage-paths'
import { playlistsApi } from '~/services/api'
import { getErrorMessage } from '~/utils/errors'

/**
 * Playlist page (client-rendered, owner only): details form (title,
 * description, visibility), the track list (drag to reorder, Move up/down,
 * remove, click to play), Play all, cover (custom or mosaic), sharing box
 * (with a warning when private tracks are included) and deletion.
 * Track list changes save immediately; the details form saves with "Save".
 */
const route = useRoute()
const id = route.params.id as string

// Play all, the highlighted current track, click-to-play rows.
const player = usePlayerStore()
// Success and failure messages.
const toast = useToast()
// Keeps the cached list of the Playlists page in sync with changes made here.
const { remember, forget } = usePlaylists()
// "Play next" / "Add to queue" in each track's menu.
const queue = useQueueActions()
// "Download" in each track's menu: the file with its metadata written in.
const { download } = useTrackDownload()

const { data: playlist, error } = await useAsyncData(`playlist-${id}`, () => playlistsApi.get(id))

// Missing or someone else's playlist: the error page (404).
if (error.value || !playlist.value) {
  throw createError({ statusCode: error.value?.statusCode ?? 404, message: 'Playlist not found', fatal: true })
}

useSeoMeta({ title: () => `${playlist.value?.title ?? 'Playlist'} · ChronoPlayer` })

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
    const updated = await playlistsApi.update(id, event.data)
    applyServerPlaylist(updated)
    // The form takes the normalized values back and is clean again.
    form.reset(toFormState(updated))
  }, 'Save failed')
  if (saved) toast.add({ title: 'Changes saved', icon: 'i-lucide-check', color: 'success' })
}

// --- Tracks: play, reorder, remove ------------------------------------------------------
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

/** A reorder/removal is being saved (spinner next to "Tracks"). */
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
    applyServerPlaylist(await playlistsApi.setTracks(id, next.map(t => t.id)))
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

/** "Remove from playlist" (the track stays in the library). */
function removeTrack(track: TrackSummary) {
  void saveTracks(tracks.value.filter(t => t.id !== track.id), 'Track not removed')
}

/** The "⋮" menu of a track row: queue actions, move, edit, remove. */
function menuFor(track: TrackSummary, index: number): DropdownMenuItem[][] {
  return [
    queue.menuItems(track),
    [
      { label: 'Move up', icon: 'i-lucide-arrow-up', disabled: index === 0, onSelect: () => move(index, -1) },
      { label: 'Move down', icon: 'i-lucide-arrow-down', disabled: index === tracks.value.length - 1, onSelect: () => move(index, 1) },
    ],
    [
      { label: 'Edit track', icon: 'i-lucide-pencil', to: `/tracks/${track.id}/edit` },
      { label: 'Download', icon: 'i-lucide-download', onSelect: () => void download(track.id) },
    ],
    [{ label: 'Remove from playlist', icon: 'i-lucide-list-x', color: 'error', onSelect: () => removeTrack(track) }],
  ]
}

// Drag and drop (mouse and touch) through the handle of each row; the new order saves at once.
const listEl = ref<HTMLElement | null>(null)
useSortableList(listEl, tracks, () => void saveTracks([...tracks.value], 'Order not saved'))

// --- Cover -----------------------------------------------------------------------------
// Custom cover: picked and cropped → `<userId>/playlists/<id>.webp` → PATCH coverPath.
// Removing it brings the mosaic of the first track covers back.
const cover = useCoverEditor({
  path: userId => buildPlaylistCoverPath(userId, id),
  save: async coverPath => applyServerPlaylist(await playlistsApi.update(id, { coverPath })),
})

// --- Sharing (based on the saved visibility) -------------------------------------------
/** Saved visibility is unlisted/public: show the share link (a change applies once saved). */
const isShared = computed(() => playlist.value?.visibility !== 'private')

// --- Deletion ----------------------------------------------------------------------------
/** The delete confirmation dialog. */
const deleteOpen = ref(false)
/** The delete request (spinner in the dialog). */
const deleting = useAsyncTask()

/** Deletes the playlist (tracks stay in the library) and goes back to the Playlists page. */
async function onDelete() {
  const deleted = await deleting.run(async () => {
    await playlistsApi.remove(id)
    forget(id)
  }, 'Delete failed')
  if (!deleted) return
  // No "unsaved changes" warning when leaving a deleted playlist.
  form.markSaved()
  deleteOpen.value = false
  toast.add({ title: 'Playlist deleted', icon: 'i-lucide-trash-2' })
  await navigateTo('/playlists')
}
</script>

<template>
  <UContainer
    v-if="playlist"
    class="max-w-5xl py-6 sm:py-8"
  >
    <!-- Header: back, title, Play all, Save -->
    <div class="mb-6 flex flex-wrap items-center gap-2">
      <UButton
        to="/playlists"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        aria-label="Back to playlists"
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
        <p
          v-if="!playlist.coverUrl"
          class="-mt-3 text-xs text-muted"
        >
          Without a cover of its own, the playlist shows the covers of its first tracks.
        </p>

        <!-- Track count and total duration -->
        <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <dt class="text-muted">
            Tracks
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
        >
          <!-- Sharing a playlist shares its private tracks too (only inside it) -->
          <UAlert
            v-if="playlist.privateTrackCount > 0"
            color="warning"
            variant="subtle"
            icon="i-lucide-lock-open"
            :title="`${pluralize(playlist.privateTrackCount, 'private track')} included`"
            description="They can be heard through this link, but only inside the playlist."
            data-testid="private-tracks-warning"
          />
        </ShareLinkBox>

        <UButton
          label="Delete playlist"
          icon="i-lucide-trash-2"
          color="error"
          variant="soft"
          block
          @click="deleteOpen = true"
        />
      </aside>

      <!-- Main column: details form, then the track list -->
      <div class="min-w-0 space-y-8">
        <UForm
          id="playlist-form"
          :schema="playlistMetadataSchema"
          :state="state"
          class="grid gap-4"
          @submit="onSubmit"
        >
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

          <UFormField
            label="Description"
            name="description"
          >
            <UTextarea
              v-model="state.description"
              :rows="3"
              autoresize
              :maxrows="12"
              placeholder="What is this playlist about?"
              class="w-full"
              data-testid="playlist-field-description"
            />
          </UFormField>

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
          <div class="mb-2 flex items-center justify-between gap-2">
            <h2 class="text-xs font-semibold uppercase tracking-widest text-muted">
              Tracks
            </h2>
            <UIcon
              v-if="savingOrder"
              name="i-lucide-loader-circle"
              class="size-4 animate-spin text-muted"
            />
          </div>

          <UEmpty
            v-if="!tracks.length"
            icon="i-lucide-list-plus"
            title="No tracks yet"
            description="Add tracks from the library with “Add to playlist” in their menu."
            :actions="[{ label: 'Go to library', to: '/', icon: 'i-lucide-library' }]"
          />

          <!-- Always in the DOM (v-show): drag and drop binds to it once, on mount. -->
          <ol
            v-show="tracks.length"
            ref="listEl"
            class="divide-y divide-default rounded-lg border border-default"
          >
            <li
              v-for="(track, index) in tracks"
              :key="track.id"
              class="flex items-center gap-2 px-2 py-2 sm:gap-3"
              :class="{ 'bg-primary/5': isCurrent(track) }"
              data-testid="playlist-track"
            >
              <DragHandle />
              <TrackCover
                :url="track.coverUrl"
                :title="track.title"
                class="size-10"
              />
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
                  <UIcon
                    v-if="track.visibility === 'private'"
                    name="i-lucide-lock"
                    class="size-3.5 shrink-0 text-dimmed"
                    aria-label="Private track"
                  />
                  <UBadge
                    v-if="track.status === 'draft'"
                    label="Draft"
                    color="warning"
                    variant="subtle"
                    size="sm"
                    class="shrink-0"
                  />
                </span>
                <span class="block truncate text-sm text-muted">{{ track.composers || '—' }}</span>
              </button>
              <span class="hidden text-sm tabular-nums text-muted sm:block">
                {{ formatTime(track.durationSeconds) }}
              </span>
              <UDropdownMenu
                :items="menuFor(track, index)"
                :content="{ align: 'end' }"
              >
                <UButton
                  icon="i-lucide-ellipsis-vertical"
                  color="neutral"
                  variant="ghost"
                  :aria-label="`Actions for ${track.title}`"
                />
              </UDropdownMenu>
            </li>
          </ol>
        </section>
      </div>
    </div>

    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Delete this playlist?"
      description="The playlist and its link are removed. Its tracks stay in your library."
      confirm-label="Delete"
      :loading="deleting.running"
      @confirm="onDelete"
    />
  </UContainer>
</template>
