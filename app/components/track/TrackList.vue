<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { ComponentPublicInstance } from 'vue'
import { useWindowVirtualizer } from '@tanstack/vue-virtual'
import type { TrackStatus, TrackSummary } from '~~/shared/types/track'

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
 *
 * Virtual scroll: only the rows on screen (and a margin around them) are in
 * the page, so a library of thousands of tracks scrolls as lightly as one
 * of twenty. The list keeps the height of all its rows, so the page scrolls
 * (and comes back to where it was) as if they were all there; every row
 * measures its real height as it appears. Everything else works on the
 * whole list as before: search, filters and sorting (the page), "select
 * all", and playing from a row with the visible list as the queue. The
 * browser's own find (Ctrl+F) only sees the rows in the page: the library
 * has its own search. Screen readers hear each row's place in the whole
 * list (`aria-posinset` / `aria-setsize`).
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

// What the rows ask the page to do: play a track, delete it, change its draft/final status.
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
// "Share link" (the device's share sheet on touch screens) or "Copy share link" in the menu.
const { shareLink, nativeShare } = useShareLink()
const { addToPlaylistMenu } = usePlaylists()
// "Play next" / "Add to queue" in the menu.
const queue = useQueueActions()
// "Download": the file with its metadata written in.
const { download } = useTrackDownload()

/** The track is in the player, or being loaded into it. */
function isCurrent(track: TrackSummary) {
  return player.current?.id === track.id || (player.status === 'loading' && player.queue[player.index]?.id === track.id)
}

/** What a click on the cover does: its accessible name and its tooltip. */
function coverLabel(track: TrackSummary) {
  return isCurrent(track) && player.isPlaying ? `Pause ${track.title}` : `Play ${track.title}`
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
    queue.menuItems(track),
    [
      { label: 'Edit', icon: 'i-lucide-pencil', to: `/tracks/${track.id}/edit` },
      { label: 'Download', icon: 'i-lucide-download', onSelect: () => void download(track.id) },
      { label: 'Add to playlist', icon: 'i-lucide-list-plus', children: addToPlaylistMenu(() => [track.id]) },
      // Draft ⇄ final in one click (also a switch on the edit page).
      track.status === 'draft'
        ? { label: 'Mark as final', icon: 'i-lucide-circle-check', onSelect: () => emit('status', track, 'final') }
        : { label: 'Mark as draft', icon: 'i-lucide-flask-conical', onSelect: () => emit('status', track, 'draft') },
    ],
    // Private tracks have no public page.
    ...(track.visibility === 'private'
      ? []
      : [[
          {
            label: nativeShare.value ? 'Share link' : 'Copy share link',
            icon: nativeShare.value ? 'i-lucide-share-2' : 'i-lucide-link',
            onSelect: () => void shareLink(track.id, 'track', track.title),
          },
          { label: 'Open share page', icon: 'i-lucide-external-link', to: `/t/${track.id}`, target: '_blank' },
        ]]),
    [{ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => emit('delete', track) }],
  ]
}

/** Genre names resolved once per render instead of in the template. */
const rows = computed(() => props.tracks.map(track => ({ track, genre: props.genreName(track.genreId) })))

// --- Virtual scroll ---------------------------------------------------------------------
/** Rows drawn beyond the edges of the screen, so a quick scroll never shows a gap. */
const OVERSCAN = 10

/** The list: rows are placed inside it, from its top. */
const listEl = ref<HTMLElement | null>(null)
/**
 * Distance from the top of the page to the list (the filters and the toolbar
 * are above it): the virtualizer follows the window's scroll, so it counts
 * in page coordinates.
 */
const listTop = ref(0)

/**
 * A row's height before it is measured: the cover (3rem) and its padding
 * (2 × 0.625rem), plus the 1px border, at the page's current root size (17px
 * on phones, 20px from `sm`). Close to the real one, so the page's height
 * (and the scroll position restored when coming back) is right from the start.
 */
function estimateRowHeight(): number {
  // The root font size in px (20 on large screens, 17 on phones).
  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  return Math.round(rem * 4.25) + 1
}

// The rows to draw for the current scroll position, out of all of them.
const virtualizer = useWindowVirtualizer(computed(() => ({
  count: rows.value.length,
  estimateSize: estimateRowHeight,
  overscan: OVERSCAN,
  scrollMargin: listTop.value,
  // Each row is its track: its measured height follows it through sorting and filtering.
  getItemKey: (index: number) => rows.value[index]!.track.id,
})))

/** The rows in the page: each with its track, its position in the whole list and its offset in the list. */
const visibleRows = computed(() => virtualizer.value.getVirtualItems().map(item => ({
  ...rows.value[item.index]!,
  index: item.index,
  top: item.start - listTop.value,
})))

/** Where the list starts on the page; again whenever something above it changes height. */
function measureListTop() {
  if (listEl.value) listTop.value = listEl.value.getBoundingClientRect().top + window.scrollY
}
// Measured once on screen, then whenever the page height changes (below).
onMounted(measureListTop)
// The page's height changes with whatever moves the list (filters wrapping, the selection bar).
useResizeObserver(() => document.body, measureListTop)

/** Lets the virtualizer measure a row's real height when it is drawn (and when it changes). */
function measureRow(el: Element | ComponentPublicInstance | null) {
  if (el instanceof Element) virtualizer.value.measureElement(el)
}
</script>

<template>
  <!--
    One row per track: checkbox (selection mode), cover (play), title, details, badges,
    duration, menu. Only the rows on screen are drawn (virtual scroll): the list keeps the
    height of all of them, and each drawn row sits at its place in it.
  -->
  <ul
    ref="listEl"
    class="relative"
    :style="{ height: `${virtualizer.getTotalSize()}px` }"
  >
    <!-- One row per track drawn: placed at its offset in the whole list (virtual scroll) -->
    <li
      v-for="{ track, genre, index, top } in visibleRows"
      :key="track.id"
      :ref="measureRow"
      :data-index="index"
      :aria-posinset="index + 1"
      :aria-setsize="rows.length"
      class="group absolute inset-x-0 top-0 flex items-center gap-3 px-2 py-2.5 transition-colors hover:bg-elevated/50 sm:px-3"
      :class="{
        'bg-primary/5': isCurrent(track) || (selectable && isSelected(track)),
        // A divider between rows, as before (none under the last one: the card's own edge is there).
        'border-b border-default': index < rows.length - 1,
      }"
      :style="{ transform: `translateY(${top}px)` }"
      data-testid="track-row"
    >
      <!-- Selection mode: a checkbox per row -->
      <UCheckbox
        v-if="selectable"
        :model-value="isSelected(track)"
        :aria-label="`Select ${track.title}`"
        data-testid="track-select"
        @update:model-value="toggleSelected(track)"
      />

      <!-- The cover plays the track: a tooltip names it, like the icon-only buttons -->
      <UTooltip
        :text="coverLabel(track)"
        :content="{ side: 'top' }"
      >
        <button
          type="button"
          class="relative size-12 shrink-0 cursor-pointer"
          :aria-label="coverLabel(track)"
          @click="emit('play', track)"
        >
          <TrackCover
            :url="track.coverUrl"
            :title="track.title"
          />
          <!--
            Play/pause overlay: always on for the current track; for the others it
            appears on hover or focus with a mouse. Touch screens have no hover,
            so there it stays on, to show that the cover can be tapped.
          -->
          <span
            class="absolute inset-0 flex items-center justify-center rounded-md bg-black/50 text-white transition-opacity"
            :class="isCurrent(track) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100'"
            data-testid="track-cover-overlay"
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
      </UTooltip>

      <!-- Title and details: clicking plays the track (or selects it in selection mode) -->
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
          <span class="truncate">{{ joinParts([track.composers, track.album, track.year]) || '—' }}</span>
        </p>
      </button>

      <!-- Badges from `md` up: genre, mastered, lyrics, visibility -->
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
        <UTooltip :text="VISIBILITY_INFO[track.visibility].label">
          <UIcon
            :name="VISIBILITY_INFO[track.visibility].icon"
            class="size-4 text-muted"
          />
        </UTooltip>
      </div>

      <!-- Duration -->
      <span class="hidden w-12 text-right text-sm tabular-nums text-muted sm:block">
        {{ formatTime(track.durationSeconds) }}
      </span>

      <!-- The row's actions menu -->
      <UDropdownMenu
        :items="menuFor(track)"
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
  </ul>
</template>
