<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { VersionTally } from '~~/shared/types/playlist'
import type { TrackSummary } from '~~/shared/types/track'

/**
 * One row of a playlist's (or group's) track list on its owner page
 * (PlaylistEditor): drag handle, cover, title and composers (click to play,
 * or pause/resume the track already in the player), badges, duration and
 * the "⋮" menu, whose items the editor builds. In a group of versions the
 * row also says which version is final and, once the friends' feedback is
 * loaded, the version's votes and plays.
 *
 * The root is the `<li>` itself, so the list's drag and drop (SortableJS,
 * through the `[data-drag-handle]` of DragHandle) moves rows as before.
 */
defineProps<{
  track: TrackSummary
  /** The track loaded in the player: highlighted, and its title pauses / resumes. */
  current: boolean
  /** The row belongs to a group of versions: a non-draft track shows "Final". */
  version: boolean
  /** The version's votes and plays (groups, once the feedback is loaded); null: no line. */
  tally: VersionTally | null
  /** The "⋮" menu: queue actions, move, final/draft (groups), edit, download, remove. */
  menu: DropdownMenuItem[][]
}>()

const emit = defineEmits<{
  /** The title was clicked: play this track (or pause / resume it when current). */
  play: []
}>()
</script>

<template>
  <li
    class="flex items-center gap-2 px-2 py-2 sm:gap-3"
    :class="{ 'bg-primary/5': current }"
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
      @click="emit('play')"
    >
      <!--
        The title, cut at the end of the line; in a group of versions on up to two lines, since
        versions share the start of their title ("Teutoburg (v1, …", "Teutoburg (v2, …") and the
        part that tells them apart is the part that was cut.
      -->
      <span
        class="flex min-w-0 items-center gap-1.5 font-medium"
        :class="{ 'text-primary': current }"
      >
        <span
          class="min-w-0"
          :class="version ? 'line-clamp-2 break-words' : 'truncate'"
        >{{ track.title }}</span>
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
          v-else-if="version"
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
        v-if="tally"
        class="flex flex-wrap items-center gap-x-3 text-xs tabular-nums text-muted"
        data-testid="version-tally"
      >
        <!-- Each figure whole: in a narrow row they wrap as a block, not word by word ("2 / votes") -->
        <span class="flex items-center gap-1 whitespace-nowrap">
          <UIcon
            name="i-lucide-heart"
            class="size-3"
          />{{ pluralize(tally.votes, 'vote') }}
        </span>
        <span class="flex items-center gap-1 whitespace-nowrap">
          <UIcon
            name="i-lucide-headphones"
            class="size-3"
          />{{ pluralize(tally.plays, 'play') }}, {{ tally.completed }} to the end
        </span>
      </span>
    </button>
    <!-- Duration (hidden on phones) -->
    <span class="hidden text-sm tabular-nums text-muted sm:block">
      {{ formatTime(track.durationSeconds) }}
    </span>
    <!-- "⋮" menu: queue, move, final/draft (groups), edit, download, remove -->
    <UDropdownMenu
      :items="menu"
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
</template>
