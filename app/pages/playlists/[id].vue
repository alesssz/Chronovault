<script setup lang="ts">
import type { DropdownMenuItem, FormSubmitEvent } from '@nuxt/ui'
import { moveArrayElement, useSortable } from '@vueuse/integrations/useSortable'
import type { SortableEvent } from 'sortablejs'
import type { PlaylistDetail } from '~~/shared/types/playlist'
import type { TrackSummary, TrackVisibility } from '~~/shared/types/track'
import { playlistMetadataSchema, type PlaylistMetadata, type PlaylistMetadataInput } from '~~/shared/schemas/playlist'
import { COVERS_BUCKET, buildPlaylistCoverPath } from '~~/shared/utils/storage-paths'
import { toSquareWebp, type CropRect } from '~/lib/image'
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

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const player = usePlayerStore()
const toast = useToast()
const { remember, forget } = usePlaylists()
const { shareUrl, copyShareLink } = useShareLink()
const queue = useQueueActions()

const { data: playlist, error } = await useAsyncData(`playlist-${id}`, () => playlistsApi.get(id))

if (error.value || !playlist.value) {
  throw createError({ statusCode: error.value?.statusCode ?? 404, message: 'Playlist not found', fatal: true })
}

useSeoMeta({ title: () => `${playlist.value?.title ?? 'Playlist'} · ChronoPlayer` })

/** Tracks in their current order (reordered locally, then saved). */
const tracks = ref<TrackSummary[]>([...playlist.value.tracks])

function applyServerPlaylist(updated: PlaylistDetail) {
  playlist.value = updated
  tracks.value = [...updated.tracks]
  remember(updated)
}

// --- Details form -------------------------------------------------------------------
type FormState = Omit<PlaylistMetadataInput, 'description'> & { description: string }

function toFormState(p: PlaylistDetail): FormState {
  return { title: p.title, description: p.description ?? '', visibility: p.visibility }
}

const state = reactive<FormState>(toFormState(playlist.value))
const baseline = ref(JSON.stringify(state))
const dirty = computed(() => JSON.stringify(state) !== baseline.value)
const saving = ref(false)

const visibilityItems: { value: TrackVisibility, label: string, description: string }[] = [
  { value: 'private', label: 'Private', description: 'Only you can listen to it.' },
  { value: 'unlisted', label: 'Unlisted', description: 'Anyone with the link can listen.' },
  { value: 'public', label: 'Public', description: 'Anyone with the link can listen; search engines may list it.' },
]

async function onSubmit(event: FormSubmitEvent<PlaylistMetadata>) {
  saving.value = true
  try {
    applyServerPlaylist(await playlistsApi.update(id, event.data))
    Object.assign(state, toFormState(playlist.value!))
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

onBeforeRouteLeave(() => {
  if (dirty.value && !window.confirm('You have unsaved changes. Leave anyway?')) return false
})

// --- Tracks: play, reorder, remove ------------------------------------------------------
const isPlayingHere = computed(() => player.sourceKey === 'library' && tracks.value.some(t => t.id === player.current?.id))

function isCurrent(track: TrackSummary) {
  return player.current?.id === track.id
}

function playAll() {
  if (isPlayingHere.value) void player.togglePlay()
  else if (tracks.value[0]) void player.playTrack(tracks.value[0], tracks.value)
}

const savingOrder = ref(false)

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

function move(index: number, offset: number) {
  const target = index + offset
  if (target < 0 || target >= tracks.value.length) return
  const next = [...tracks.value]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item!)
  void saveTracks(next, 'Order not saved')
}

function removeTrack(track: TrackSummary) {
  void saveTracks(tracks.value.filter(t => t.id !== track.id), 'Track not removed')
}

function menuFor(track: TrackSummary, index: number): DropdownMenuItem[][] {
  return [
    [
      { label: 'Play next', icon: 'i-lucide-list-start', onSelect: () => void queue.playNext(track) },
      { label: 'Add to queue', icon: 'i-lucide-list-end', onSelect: () => void queue.addToQueue(track) },
    ],
    [
      { label: 'Move up', icon: 'i-lucide-arrow-up', disabled: index === 0, onSelect: () => move(index, -1) },
      { label: 'Move down', icon: 'i-lucide-arrow-down', disabled: index === tracks.value.length - 1, onSelect: () => move(index, 1) },
    ],
    [{ label: 'Edit track', icon: 'i-lucide-pencil', to: `/tracks/${track.id}/edit` }],
    [{ label: 'Remove from playlist', icon: 'i-lucide-list-x', color: 'error', onSelect: () => removeTrack(track) }],
  ]
}

// Drag and drop (mouse and touch) through the handle of each row.
const listEl = ref<HTMLElement | null>(null)
useSortable(listEl, tracks, {
  handle: '[data-drag-handle]',
  animation: 150,
  onUpdate: (event: SortableEvent) => {
    if (event.oldIndex == null || event.newIndex == null || event.oldIndex === event.newIndex) return
    moveArrayElement(tracks, event.oldIndex, event.newIndex, event)
    nextTick(() => void saveTracks([...tracks.value], 'Order not saved'))
  },
})

// --- Cover -----------------------------------------------------------------------------
const coverBusy = ref(false)

/** New custom cover (cropped in the crop editor): WebP → Supabase Storage → PATCH coverPath. */
async function onCoverSelected(file: File, crop: CropRect) {
  const userId = user.value?.sub
  if (!userId) return
  coverBusy.value = true
  try {
    const webp = await toSquareWebp(file, { crop })
    const path = buildPlaylistCoverPath(userId, id)
    const { error: uploadError } = await supabase.storage.from(COVERS_BUCKET).upload(path, webp, {
      contentType: 'image/webp',
      upsert: true,
    })
    if (uploadError) throw uploadError
    applyServerPlaylist(await playlistsApi.update(id, { coverPath: path }))
    toast.add({ title: 'Cover updated', icon: 'i-lucide-image', color: 'success' })
  }
  catch (err) {
    toast.add({ title: 'Cover not updated', description: getErrorMessage(err), color: 'error' })
  }
  finally {
    coverBusy.value = false
  }
}

async function onCoverRemoved() {
  coverBusy.value = true
  try {
    applyServerPlaylist(await playlistsApi.update(id, { coverPath: null }))
  }
  catch (err) {
    toast.add({ title: 'Cover not removed', description: getErrorMessage(err), color: 'error' })
  }
  finally {
    coverBusy.value = false
  }
}

// --- Sharing (based on the saved visibility) -------------------------------------------
const isShared = computed(() => playlist.value?.visibility !== 'private')

// --- Deletion ----------------------------------------------------------------------------
const deleteOpen = ref(false)
const deleting = ref(false)

async function onDelete() {
  deleting.value = true
  try {
    await playlistsApi.remove(id)
    forget(id)
    baseline.value = JSON.stringify(state)
    deleteOpen.value = false
    toast.add({ title: 'Playlist deleted', icon: 'i-lucide-trash-2' })
    await navigateTo('/playlists')
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
  <UContainer
    v-if="playlist"
    class="max-w-5xl py-6 sm:py-8"
  >
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
        :loading="saving"
        :disabled="!dirty"
        data-testid="save-playlist"
      />
    </div>

    <div class="grid gap-8 md:grid-cols-[16rem_1fr]">
      <aside class="space-y-6">
        <TrackCoverPicker
          :url="playlist.coverUrl"
          :title="playlist.title"
          :busy="coverBusy"
          @select="onCoverSelected"
          @remove="onCoverRemoved"
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

        <div
          class="space-y-2"
          data-testid="share-box"
        >
          <h2 class="text-xs font-semibold uppercase tracking-widest text-muted">
            Sharing
          </h2>
          <template v-if="isShared">
            <p class="text-sm text-muted">
              Anyone with the link can listen to every track in this playlist, without an account. The Suno prompt and the mastering status are never shown.
            </p>
            <UAlert
              v-if="playlist.privateTrackCount > 0"
              color="warning"
              variant="subtle"
              icon="i-lucide-lock-open"
              :title="`${playlist.privateTrackCount} private track${playlist.privateTrackCount > 1 ? 's' : ''} included`"
              description="They can be heard through this link, but only inside the playlist."
              data-testid="private-tracks-warning"
            />
            <UFieldGroup class="w-full">
              <UButton
                label="Copy share link"
                icon="i-lucide-link"
                color="neutral"
                variant="subtle"
                block
                data-testid="copy-share-link"
                @click="copyShareLink(id, 'playlist')"
              />
              <UButton
                :to="shareUrl(id, 'playlist')"
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
          label="Delete playlist"
          icon="i-lucide-trash-2"
          color="error"
          variant="soft"
          block
          @click="deleteOpen = true"
        />
      </aside>

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
              :items="visibilityItems"
              orientation="horizontal"
              variant="card"
              class="w-full"
            />
          </UFormField>
        </UForm>

        <section>
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
              <span
                class="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center text-dimmed hover:text-muted active:cursor-grabbing"
                aria-hidden="true"
                data-drag-handle
              >
                <UIcon
                  name="i-lucide-grip-vertical"
                  class="size-4"
                />
              </span>
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
      :loading="deleting"
      @confirm="onDelete"
    />
  </UContainer>
</template>
