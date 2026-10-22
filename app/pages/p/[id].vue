<script setup lang="ts">
import { sharedApi } from '~/services/api'

/**
 * Public page of a playlist shared by link ('unlisted' or 'public'): no
 * account needed. Lists every track (private ones included: sharing a
 * playlist shares its content) and shows the lyrics and description of the
 * track being played. Server-rendered for link previews.
 */
definePageMeta({ layout: 'public' })

// Playlist id from the URL (/p/:id).
const route = useRoute()
const id = String(route.params.id)
// Before any `await`: they need the component context.
const player = usePlayerStore()
// Site origin (works during SSR too): absolute URLs for the link preview tags.
const origin = useRequestURL().origin

// Private, missing or malformed links answer 404 (see useSharedItem).
const { data: playlist, notFound } = await useSharedItem(`shared-playlist-${id}`, () => sharedApi.playlist(id))

// --- Link preview -----------------------------------------------------------------
/** "Playlist · 12 tracks · 48:10" (under the title, and the preview text without a description). */
const summary = computed(() => {
  const p = playlist.value
  return p ? joinParts(['Playlist', pluralize(p.tracks.length, 'track'), formatTime(p.durationSeconds)]) : ''
})
/** Preview text: the description, or a summary (count and duration). */
const previewText = computed(() => {
  const p = playlist.value
  if (!p) return 'This playlist is not available.'
  return truncate(p.description?.trim() || summary.value, 200)
})
/** There is an image for the preview (custom cover or a track cover). */
const hasCover = computed(() => !!playlist.value && (!!playlist.value.coverUrl || playlist.value.mosaic.length > 0))

useShareMeta({
  kind: 'playlist',
  id,
  origin,
  title: () => playlist.value?.title ?? null,
  description: () => previewText.value,
  hasImage: () => hasCover.value,
  isPublic: () => playlist.value?.visibility === 'public',
})

// --- Playback ---------------------------------------------------------------------
/** The player is playing this playlist (and not something else). */
const isHere = computed(() => player.sourceKey === `playlist:${id}`)
/** Playing this playlist right now (big button shows Pause). */
const isPlaying = computed(() => isHere.value && player.isPlaying)

/** The track shown in the "now playing" panel: the current one, or the first before playing. */
const activeTrack = computed(() => {
  const tracks = playlist.value?.tracks ?? []
  return (isHere.value && tracks.find(t => t.id === player.current?.id)) || tracks[0] || null
})
/** "Album · Year · Genre" of the active track. */
const activeMeta = computed(() => {
  const t = activeTrack.value
  return t ? joinParts([t.album, t.year, t.genre]) : ''
})
/** The active track has lyrics to show (otherwise "No lyrics for this track"). */
const activeHasLyrics = computed(() => !!activeTrack.value && hasLyrics(activeTrack.value))

// The first track is ready (waveform included) before the first click.
onMounted(() => {
  if (playlist.value?.tracks.length) void player.playSharedPlaylist(playlist.value, 0, false)
})
// Leaving the page stops the music: this page is the only place it is controlled from.
onBeforeUnmount(() => player.close())

/** The track is the one loaded from this playlist. */
function isActive(trackId: string) {
  return isHere.value && player.current?.id === trackId
}

/** Plays the playlist from a given track. */
function playAt(index: number) {
  if (playlist.value) void player.playSharedPlaylist(playlist.value, index)
}

/** Big play button: toggles the current track, or starts from the first. */
function togglePlay() {
  if (isHere.value && player.status !== 'error') void player.togglePlay()
  else playAt(0)
}

/** Clicking a synced line seeks there (only while this playlist is playing). */
function onLyricSeek(seconds: number) {
  if (isHere.value) player.seek(seconds)
}
</script>

<template>
  <UContainer class="py-6 sm:py-10">
    <div
      v-if="playlist"
      class="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-12"
      data-testid="shared-playlist"
    >
      <!-- Left: cover or mosaic, title, description, player, track list -->
      <section class="flex min-w-0 flex-col gap-6">
        <PlaylistCover
          :url="playlist.coverUrl"
          :mosaic="playlist.mosaic"
          :title="playlist.title"
          rounded="rounded-xl"
          class="mx-auto w-full max-w-sm shadow-2xl shadow-black/40 lg:max-w-none"
        />

        <div class="min-w-0">
          <h1
            class="text-3xl font-bold tracking-tight text-balance"
            data-testid="shared-playlist-title"
          >
            {{ playlist.title }}
          </h1>
          <p class="mt-1 text-sm text-dimmed">
            {{ summary }}
          </p>
          <p
            v-if="playlist.description"
            class="mt-3 whitespace-pre-line leading-relaxed"
            data-testid="shared-playlist-description"
          >
            {{ playlist.description }}
          </p>
        </div>

        <!-- Play button, waveform, times and playback errors -->
        <SharePlayer
          v-if="playlist.tracks.length"
          :active="isHere"
          :duration="activeTrack?.durationSeconds ?? null"
          @toggle="togglePlay"
        />

        <!-- The tracks: click to play (or toggle the active one) -->
        <ol
          v-if="playlist.tracks.length"
          class="divide-y divide-default rounded-xl border border-default"
          aria-label="Tracks"
        >
          <li
            v-for="(track, index) in playlist.tracks"
            :key="track.id"
            data-testid="shared-playlist-track"
          >
            <button
              type="button"
              class="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-elevated/50"
              :class="{ 'bg-primary/5': isActive(track.id) }"
              :aria-current="isActive(track.id) ? 'true' : undefined"
              @click="isActive(track.id) ? player.togglePlay() : playAt(index)"
            >
              <span class="w-5 shrink-0 text-right text-sm tabular-nums text-dimmed">
                <UIcon
                  v-if="isActive(track.id) && player.isPlaying"
                  name="i-lucide-audio-lines"
                  class="size-4 text-primary"
                />
                <template v-else>{{ index + 1 }}</template>
              </span>
              <TrackCover
                :url="track.coverUrl"
                :title="track.title"
                class="size-10"
              />
              <span class="min-w-0 flex-1">
                <!-- Title, "WIP" on drafts (versions to choose from) -->
                <span class="flex min-w-0 items-center gap-2">
                  <span
                    class="truncate font-medium"
                    :class="{ 'text-primary': isActive(track.id) }"
                  >{{ track.title }}</span>
                  <UBadge
                    v-if="track.status === 'draft'"
                    label="WIP"
                    color="warning"
                    variant="subtle"
                    size="sm"
                    class="shrink-0"
                    title="Work in progress"
                    data-testid="shared-track-wip"
                  />
                </span>
                <span class="block truncate text-sm text-muted">{{ track.composers || '—' }}</span>
              </span>
              <span class="text-sm tabular-nums text-muted">{{ formatTime(track.durationSeconds) }}</span>
            </button>
          </li>
        </ol>

        <UEmpty
          v-else
          icon="i-lucide-list-music"
          title="This playlist is empty"
        />
      </section>

      <!-- Now playing: lyrics and description of the active track -->
      <section
        v-if="activeTrack"
        class="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:h-[calc(100dvh-8rem)] lg:self-start"
        aria-label="Now playing"
        data-testid="shared-now-playing"
      >
        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase tracking-widest text-muted">
            {{ isPlaying ? 'Now playing' : 'Track' }}<span
              v-if="activeTrack.status === 'draft'"
              class="text-warning"
            > · Work in progress</span>
          </p>
          <h2
            class="truncate text-xl font-bold tracking-tight"
            data-testid="shared-now-playing-title"
          >
            {{ activeTrack.title }}
          </h2>
          <p
            v-if="activeTrack.composers || activeMeta"
            class="truncate text-sm text-muted"
          >
            {{ [activeTrack.composers, activeMeta].filter(Boolean).join(' · ') }}
          </p>
        </div>

        <div
          v-if="activeHasLyrics"
          class="h-[60dvh] min-h-0 rounded-xl border border-default bg-elevated/30 px-4 sm:px-6 lg:h-auto lg:flex-1"
          data-testid="shared-lyrics"
        >
          <LyricsView
            :key="activeTrack.id"
            :synced="activeTrack.lyricsSynced"
            :plain="activeTrack.lyrics"
            :current-time="isHere && player.current?.id === activeTrack.id ? player.currentTime : 0"
            @seek="onLyricSeek"
          />
        </div>
        <p
          v-else
          class="text-sm text-muted"
        >
          No lyrics for this track.
        </p>

        <div
          v-if="activeTrack.description"
          class="max-h-48 shrink-0 space-y-1 overflow-y-auto"
        >
          <h3 class="text-xs font-semibold uppercase tracking-widest text-muted">
            About this track
          </h3>
          <p
            class="whitespace-pre-line text-sm leading-relaxed"
            data-testid="shared-track-description"
          >
            {{ activeTrack.description }}
          </p>
        </div>
      </section>
    </div>

    <!-- Private, missing or malformed link -->
    <ShareUnavailable
      v-else
      kind="playlist"
      :not-found="notFound"
    />
  </UContainer>
</template>
