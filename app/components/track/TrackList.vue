<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { TrackStatus, TrackSummary, TrackVisibility } from '~~/shared/types/track'

/**
 * The library list: cover (play/pause on click), title (play, or open the
 * full-screen view for the current track), composers, a "Draft" badge,
 * genre, badges (mastered, synced lyrics, visibility), duration and the "⋮"
 * menu: Edit, Download, Add to playlist, Mark as final/draft, Copy share
 * link / Open share page, Delete.
 * Playing, deleting and status changes are delegated to the page through events.
 *
 * Selection mode (`selectable`): each row gets a checkbox, and clicking the
 * title toggles it instead of playing; the cover still plays, so versions
 * can be listened to while choosing. The page owns the selected ids
 * (`v-model:selected`) and the actions on them.
 */
const props = defineProps<{
  /** Already filtered and sorted by the page. */
  tracks: TrackSummary[]
  genreName: (id: string | null) => string | null
  /** Show checkboxes (selection mode). */
  selectable?: boolean
}>()

/** Ids of the selected tracks (selection mode). */
const selected = defineModel<string[]>('selected', { default: () => [] })

const emit = defineEmits<{
  /** Play this track with the visible list as the queue (or toggle it). */
  play: [track: TrackSummary]
  /** Ask for confirmation, then delete (the page owns the dialog). */
  delete: [track: TrackSummary]
  /** Mark the track as draft or final (the page saves it). */
  status: [track: TrackSummary, status: TrackStatus]
}>()

/** The track's checkbox is ticked. */
function isSelected(track: TrackSummary): boolean {
  return selected.value.includes(track.id)
}

/** Ticks or unticks a track (a new array, so the page's v-model updates). */
function toggleSelected(track: TrackSummary): void {
  selected.value = isSelected(track)
    ? selected.value.filter(id => id !== track.id)
    : [...selected.value, track.id]
}

// Highlights the current track and opens the full-screen view.
const player = usePlayerStore()
const { copyShareLink } = useShareLink()
const { playlists, openCreateDialog, addToPlaylist } = usePlaylists()
// "Play next" / "Add to queue" in the menu.
const queue = useQueueActions()
// "Download": the file with its metadata written in.
const { download } = useTrackDownload()

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
  // Selecting: the title is the big, easy target for the checkbox.
  if (props.selectable) toggleSelected(track)
  else if (isCurrent(track) && player.status !== 'error') player.setExpanded(true)
  else emit('play', track)
}

/** The "⋮" menu of a row; groups are separated by dividers. */
function menuFor(track: TrackSummary): DropdownMenuItem[][] {
  return [
    [
      { label: 'Play next', icon: 'i-lucide-list-start', onSelect: () => void queue.playNext(track) },
      { label: 'Add to queue', icon: 'i-lucide-list-end', onSelect: () => void queue.addToQueue(track) },
    ],
    [
      { label: 'Edit', icon: 'i-lucide-pencil', to: `/tracks/${track.id}/edit` },
      { label: 'Download', icon: 'i-lucide-download', onSelect: () => void download(track.id) },
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
      // Draft ⇄ final in one click (also a switch on the edit page).
      track.status === 'draft'
        ? { label: 'Mark as final', icon: 'i-lucide-circle-check', onSelect: () => emit('status', track, 'final') }
        : { label: 'Mark as draft', icon: 'i-lucide-flask-conical', onSelect: () => emit('status', track, 'draft') },
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
  <!-- One row per track: checkbox (selection mode), cover (play), title, details, badges, duration, menu -->
  <ul class="divide-y divide-default">
    <li
      v-for="{ track, genre } in rows"
      :key="track.id"
      class="group flex items-center gap-3 px-2 py-2.5 transition-colors hover:bg-elevated/50 sm:px-3"
      :class="{ 'bg-primary/5': isCurrent(track) || (selectable && isSelected(track)) }"
      data-testid="track-row"
    >
      <UCheckbox
        v-if="selectable"
        :model-value="isSelected(track)"
        :aria-label="`Select ${track.title}`"
        data-testid="track-select"
        @update:model-value="toggleSelected(track)"
      />

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
        :title="selectable ? 'Select' : isCurrent(track) && player.status !== 'error' ? 'Open the player' : 'Play'"
        data-testid="track-title"
        @click="onTitleClick(track)"
      >
        <p
          class="truncate font-medium"
          :class="{ 'text-primary': isCurrent(track) }"
        >
          {{ track.title }}
        </p>
        <!-- Details line, led by a "Draft" badge on work-in-progress versions (here it never squeezes the title, on phones too) -->
        <p class="flex min-w-0 items-center gap-1.5 text-sm text-muted">
          <UBadge
            v-if="track.status === 'draft'"
            label="Draft"
            color="warning"
            variant="subtle"
            size="sm"
            class="shrink-0"
            data-testid="draft-badge"
          />
          <span class="truncate">{{ [track.composers, track.album, track.year].filter(Boolean).join(' · ') || '—' }}</span>
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
