<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { TrackSummary, TrackVisibility } from '~~/shared/types/track'

/**
 * The library list: cover (play/pause on click), title (play, or open the
 * full-screen view for the current track), composers, genre, badges
 * (mastered, synced lyrics, visibility), duration and the "⋮" menu:
 * Edit, Add to playlist, Copy share link / Open share page, Delete.
 * Playing and deleting are delegated to the page through events.
 */
const props = defineProps<{
  /** Already filtered and sorted by the page. */
  tracks: TrackSummary[]
  genreName: (id: string | null) => string | null
}>()

const emit = defineEmits<{
  /** Play this track with the visible list as the queue (or toggle it). */
  play: [track: TrackSummary]
  /** Ask for confirmation, then delete (the page owns the dialog). */
  delete: [track: TrackSummary]
}>()

const player = usePlayerStore()
const { copyShareLink } = useShareLink()
const { playlists, openCreateDialog, addToPlaylist } = usePlaylists()

/** Icon + accessible label of each visibility. */
const visibilityIcon: Record<TrackVisibility, { icon: string, label: string }> = {
  private: { icon: 'i-lucide-lock', label: 'Private' },
  unlisted: { icon: 'i-lucide-link', label: 'Unlisted' },
  public: { icon: 'i-lucide-globe', label: 'Public' },
}

/** The track is in the player, or being loaded into it. */
function isCurrent(track: TrackSummary) {
  return player.current?.id === track.id || (player.status === 'loading' && player.queue[player.index]?.id === track.id)
}

/**
 * Clicking a track's name plays it; on the track already in the player
 * (playing or paused) it opens the full-screen view instead.
 * A track that failed to play is simply started again.
 */
function onTitleClick(track: TrackSummary) {
  if (isCurrent(track) && player.status !== 'error') player.setExpanded(true)
  else emit('play', track)
}

/** The "⋮" menu of a row; groups are separated by dividers. */
function menuFor(track: TrackSummary): DropdownMenuItem[][] {
  return [
    [
      { label: 'Edit', icon: 'i-lucide-pencil', to: `/tracks/${track.id}/edit` },
      {
        label: 'Add to playlist',
        icon: 'i-lucide-list-plus',
        children: [
          [{ label: 'New playlist…', icon: 'i-lucide-plus', onSelect: () => openCreateDialog([track.id]) }],
          playlists.value.map(playlist => ({
            label: playlist.title,
            icon: 'i-lucide-list-music',
            onSelect: () => void addToPlaylist(playlist, [track.id]),
          })),
        ].filter(group => group.length > 0),
      },
    ],
    // Private tracks have no public page.
    ...(track.visibility === 'private'
      ? []
      : [[
          { label: 'Copy share link', icon: 'i-lucide-link', onSelect: () => void copyShareLink(track.id) },
          { label: 'Open share page', icon: 'i-lucide-external-link', to: `/t/${track.id}`, target: '_blank' },
        ]]),
    [{ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => emit('delete', track) }],
  ]
}

/** Genre names resolved once per render instead of in the template. */
const rows = computed(() => props.tracks.map(track => ({ track, genre: props.genreName(track.genreId) })))
</script>

<template>
  <ul class="divide-y divide-default">
    <li
      v-for="{ track, genre } in rows"
      :key="track.id"
      class="group flex items-center gap-3 px-2 py-2.5 transition-colors hover:bg-elevated/50 sm:px-3"
      :class="{ 'bg-primary/5': isCurrent(track) }"
      data-testid="track-row"
    >
      <button
        type="button"
        class="relative size-12 shrink-0 cursor-pointer"
        :aria-label="isCurrent(track) && player.isPlaying ? `Pause ${track.title}` : `Play ${track.title}`"
        @click="emit('play', track)"
      >
        <TrackCover
          :url="track.coverUrl"
          :title="track.title"
        />
        <span
          class="absolute inset-0 flex items-center justify-center rounded-md bg-black/50 text-white transition-opacity"
          :class="isCurrent(track) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'"
        >
          <UIcon
            v-if="isCurrent(track) && player.status === 'loading'"
            name="i-lucide-loader-circle"
            class="size-5 animate-spin"
          />
          <UIcon
            v-else
            :name="isCurrent(track) && player.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
            class="size-5"
          />
        </span>
      </button>

      <button
        type="button"
        class="min-w-0 flex-1 cursor-pointer rounded-sm text-left"
        :title="isCurrent(track) && player.status !== 'error' ? 'Open the player' : 'Play'"
        data-testid="track-title"
        @click="onTitleClick(track)"
      >
        <p
          class="truncate font-medium"
          :class="{ 'text-primary': isCurrent(track) }"
        >
          {{ track.title }}
        </p>
        <p class="truncate text-sm text-muted">
          {{ [track.composers, track.album, track.year].filter(Boolean).join(' · ') || '—' }}
        </p>
      </button>

      <div class="hidden items-center gap-1.5 md:flex">
        <UBadge
          v-if="genre"
          :label="genre"
          color="neutral"
          variant="subtle"
          size="sm"
        />
        <UTooltip :text="track.mastered ? 'Mastered' : 'Not mastered'">
          <UIcon
            name="i-lucide-badge-check"
            class="size-4"
            :class="track.mastered ? 'text-success' : 'text-dimmed'"
          />
        </UTooltip>
        <UTooltip
          v-if="track.hasLyrics || track.hasSyncedLyrics"
          :text="track.hasSyncedLyrics ? 'Synced lyrics' : 'Lyrics'"
        >
          <UIcon
            name="i-lucide-mic-vocal"
            class="size-4"
            :class="track.hasSyncedLyrics ? 'text-primary' : 'text-muted'"
          />
        </UTooltip>
        <UTooltip :text="visibilityIcon[track.visibility].label">
          <UIcon
            :name="visibilityIcon[track.visibility].icon"
            class="size-4 text-muted"
          />
        </UTooltip>
      </div>

      <span class="hidden w-12 text-right text-sm tabular-nums text-muted sm:block">
        {{ formatTime(track.durationSeconds) }}
      </span>

      <UDropdownMenu
        :items="menuFor(track)"
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
  </ul>
</template>
