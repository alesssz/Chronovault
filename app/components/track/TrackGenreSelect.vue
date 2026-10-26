<script setup lang="ts">
/**
 * Genre field of the track editor: a built-in genre, one of the user's own,
 * or a new one typed in ("Create" makes the custom genre and selects it).
 * Put it inside a UFormField (name="genreId"), which labels and validates it.
 */

/** The genre id; null for none (the select says undefined when cleared: converted here, as the schema expects null). */
const model = defineModel<string | null>({ required: true })

// The genre list (cached app-wide), and creating a genre typed in the select.
const { genres, createGenre } = useGenres()

/** The select's value: undefined for none, as USelectMenu speaks. */
const value = computed({
  get: () => model.value ?? undefined,
  set: (id: string | null | undefined) => {
    model.value = id ?? null
  },
})

/** Genre options for the select menu (built-in and custom, sorted by name). */
const items = computed(() => genres.value.map(g => ({ label: g.name, value: g.id })))

/** Creating a custom genre from the menu (an error shows a toast). */
const creating = useAsyncTask()

/** "Create" in the menu: creates the custom genre and selects it. */
async function onCreate(name: string) {
  await creating.run(async () => {
    model.value = (await createGenre(name)).id
  }, 'Genre not created')
}
</script>

<template>
  <USelectMenu
    v-model="value"
    :items="items"
    value-key="value"
    create-item
    clear
    placeholder="Select a genre"
    class="w-full"
    @create="onCreate"
  />
</template>
