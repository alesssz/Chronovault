<script setup lang="ts">
/**
 * Genre field of the track editor: one of the fixed list of genres (none can
 * be added: a style that needs a name of its own is a subgenre, in
 * TrackSubgenreSelect beside it). The menu's search box filters the list.
 * Put it inside a UFormField (name="genreId"), which labels and validates it.
 */

/** The genre id; null for none (the select says undefined when cleared: converted here, as the schema expects null). */
const model = defineModel<string | null>({ required: true })

// The genre list (cached app-wide).
const { genres } = useGenres()

/** The select's value: undefined for none, as USelectMenu speaks. */
const value = computed({
  get: () => model.value ?? undefined,
  set: (id: string | null | undefined) => {
    model.value = id ?? null
  },
})

/** Genre options for the select menu, sorted by name. */
const items = computed(() => genres.value.map(g => ({ label: g.name, value: g.id })))
</script>

<template>
  <USelectMenu
    v-model="value"
    :items="items"
    value-key="value"
    clear
    placeholder="Select a genre"
    :search-input="{ placeholder: 'Search genres…' }"
    class="w-full"
    data-testid="genre-select"
  />
</template>
