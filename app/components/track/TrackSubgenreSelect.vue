<script setup lang="ts">
/**
 * Subgenre field of the track editor, beside the genre: the chosen genre's
 * subgenres, built-in and the user's own, or a new one typed in ("Create"
 * makes the custom subgenre under that genre and selects it). Disabled until
 * a genre is chosen. A name incoherent with the genre ("Thrash Metal" under
 * Pop) is refused by the server: its reason ("Thrash Metal belongs to Metal")
 * shows in the error toast.
 * Put it inside a UFormField (name="subgenreId"), which labels and validates it.
 */

/** The genre the subgenres belong to; null for none (the field is disabled). */
const props = defineProps<{ genreId: string | null }>()

/** The subgenre id; null for none. */
const model = defineModel<string | null>({ required: true })

// The genre list with its subgenres (cached app-wide), and creating a subgenre typed in the select.
const { genres, createSubgenre } = useGenres()

/** The select's value: undefined for none, as USelectMenu speaks. */
const value = computed({
  get: () => model.value ?? undefined,
  set: (id: string | null | undefined) => {
    model.value = id ?? null
  },
})

/** The chosen genre's subgenres, built-in and own, sorted by name ([] without a genre). */
const items = computed(() => genres.value
  .find(g => g.id === props.genreId)?.subgenres
  .map(s => ({ label: s.name, value: s.id })) ?? [])

/** Creating a custom subgenre from the menu (an error, an incoherent name included, shows a toast). */
const creating = useAsyncTask()

/** "Create" in the menu: creates the custom subgenre under the genre and selects it. */
async function onCreate(name: string) {
  // The genre at the time of the click (the field is disabled without one).
  const genreId = props.genreId
  if (!genreId) return
  await creating.run(async () => {
    model.value = (await createSubgenre(genreId, name)).id
  }, 'Subgenre not created')
}
</script>

<template>
  <USelectMenu
    v-model="value"
    :items="items"
    value-key="value"
    :disabled="!genreId"
    :loading="creating.running"
    create-item
    clear
    :placeholder="genreId ? 'Select a subgenre' : 'Choose a genre first'"
    :search-input="{ placeholder: 'Search or type a new subgenre…' }"
    class="w-full"
    data-testid="subgenre-select"
    @create="onCreate"
  />
</template>
