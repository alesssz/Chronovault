<script setup lang="ts">
import type { Genre } from '~~/shared/types/track'

/**
 * The genres and their subgenres, as a reference to fill in a metadata file
 * (pages/tracks/import.vue): the names the import takes in the `genre` and
 * `subgenre` columns. The Excel download has the same list on its Help
 * sheet; CSV and JSON users find it here. In a HelpAccordion, closed by
 * default (over 400 names). The search box filters by name, case aside: a
 * genre that matches shows all its subgenres, otherwise only the subgenres
 * that match show, under their genre. The user's own subgenres are marked
 * "yours".
 */
const props = defineProps<{
  /** The genres with their subgenres (useGenres). */
  genres: Genre[]
}>()

/** The search box's text. */
const query = ref('')

/** The genres to show, each with the subgenres to show. */
const shown = computed(() => {
  // The search, folded like the names for the comparison.
  const q = foldCase(query.value)
  if (!q) return props.genres
  return props.genres
    .map(genre => foldCase(genre.name).includes(q)
      ? genre
      : { ...genre, subgenres: genre.subgenres.filter(s => foldCase(s.name).includes(q)) })
    .filter(genre => genre.subgenres.length || foldCase(genre.name).includes(q))
})
</script>

<template>
  <HelpAccordion
    label="Genres and subgenres"
    data-testid="genre-reference"
  >
    <div class="space-y-3">
      <p class="text-muted">
        The <code>genre</code> column takes one of these genres; the <code>subgenre</code> column one of its subgenres,
        or a new name, created as yours.
      </p>
      <UInput
        v-model="query"
        icon="i-lucide-search"
        placeholder="Search genres and subgenres…"
        aria-label="Search genres and subgenres"
        class="w-full sm:max-w-xs"
        data-testid="genre-reference-search"
      />
      <dl
        v-if="shown.length"
        class="grid gap-x-4 gap-y-2 sm:grid-cols-[10rem_1fr]"
      >
        <template
          v-for="genre in shown"
          :key="genre.id"
        >
          <dt
            class="font-medium text-highlighted"
            data-testid="genre-reference-genre"
          >
            {{ genre.name }}
          </dt>
          <dd class="text-muted">
            <span
              v-for="(subgenre, index) in genre.subgenres"
              :key="subgenre.id"
              data-testid="genre-reference-subgenre"
            >{{ subgenre.name }}<UBadge
              v-if="subgenre.custom"
              label="yours"
              size="sm"
              color="primary"
              variant="subtle"
              class="ms-1 align-middle"
            /><template v-if="index < genre.subgenres.length - 1">, </template></span>
          </dd>
        </template>
      </dl>
      <p
        v-else
        class="text-muted"
      >
        No genre or subgenre matches “{{ query }}”.
      </p>
    </div>
  </HelpAccordion>
</template>
