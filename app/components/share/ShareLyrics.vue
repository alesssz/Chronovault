<script setup lang="ts">
import type { SyncedLyricLine } from '~~/shared/types/track'

/**
 * The lyrics of a share page (/t/:id, /p/:id): LyricsView, following the
 * player's position while the player holds this track, at 0:00 otherwise.
 *
 * Its own component for one reason: the position changes on every animation
 * frame while the music plays. Read in a page's template, it made the whole
 * page render again 60 times a second: on a playlist's page, every one of up
 * to 1000 track rows rebuilt and compared each time, a cost phones paid in
 * battery. Read here, only this component renders again, the same way
 * LyricsSyncClock keeps the sync editor out of the per-frame work.
 */
defineProps<{
  /** Synced lines, which win over the plain lyrics when there are some. */
  synced: SyncedLyricLine[] | null
  /** Plain lyrics. */
  plain: string | null
  /** The player holds this very track: the lines follow its position (otherwise they rest at 0:00). */
  following: boolean
}>()

/** A line was clicked: the page seeks there (only while it plays this track). */
const emit = defineEmits<{ seek: [seconds: number] }>()

// The app-wide player, for its position.
const player = usePlayerStore()
</script>

<template>
  <!-- `shared`: a visitor never gets the owner's hint to add lyrics -->
  <LyricsView
    :synced="synced"
    :plain="plain"
    :current-time="following ? player.currentTime : 0"
    shared
    @seek="emit('seek', $event)"
  />
</template>
