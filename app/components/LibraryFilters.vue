<script setup lang="ts">
import type { TrackStatus } from '~~/shared/types/track'

/**
 * The library's filters and sort order (pages/index.vue): genre, mastering,
 * version (final / drafts), sort. The page owns the values (one v-model each)
 * and places the four: in the toolbar from `md` (its classes lay them out),
 * stacked in the Filters panel on phones.
 */
defineProps<{
  /** "All genres", then the genres the library uses. */
  genreOptions: { label: string, value: string }[]
}>()

/** Genre id, or 'all'. */
const genre = defineModel<string>('genre', { required: true })
/** Mastered tracks only, not mastered only, or both. */
const mastered = defineModel<'all' | 'yes' | 'no'>('mastered', { required: true })
/** Final versions only, drafts only, or both. */
const status = defineModel<'all' | TrackStatus>('status', { required: true })
/** Newest first (as the API returns them) or by title. */
const sort = defineModel<'recent' | 'title'>('sort', { required: true })

/** Options of the mastering filter ("Mastering" = no filter: short enough for phones). */
const masteredOptions = [
  { label: 'Mastering', value: 'all' },
  { label: 'Mastered', value: 'yes' },
  { label: 'Not mastered', value: 'no' },
]

/** Options of the version filter. */
const statusOptions = [
  { label: 'All versions', value: 'all' },
  { label: 'Final', value: 'final' },
  { label: 'Drafts', value: 'draft' },
]

/** Options of the sort menu. */
const sortOptions = [
  { label: 'Most recent', value: 'recent' },
  { label: 'Title A-Z', value: 'title' },
]
</script>

<template>
  <!-- Full width in their grid cell; fixed widths in the single row of `xl` -->
  <div>
    <USelect
      v-model="genre"
      :items="genreOptions"
      class="w-full xl:w-40"
      aria-label="Filter by genre"
    />
    <USelect
      v-model="mastered"
      :items="masteredOptions"
      class="w-full xl:w-40"
      aria-label="Filter by mastering"
    />
    <USelect
      v-model="status"
      :items="statusOptions"
      class="w-full xl:w-36"
      aria-label="Filter by version"
      data-testid="status-filter"
    />
    <USelect
      v-model="sort"
      :items="sortOptions"
      class="w-full xl:w-36"
      aria-label="Sort"
    />
  </div>
</template>
