<script setup lang="ts">
import type { Genre, Subgenre } from '~~/shared/types/track'

/**
 * The user's own subgenres (created in the editor's Subgenre field or by a
 * metadata import), each with its genre, to rename or delete: a typo ("Swmap
 * Metal") otherwise stayed for good in the editor's list, the library's filter
 * and this page's reference. Shown at the top of GenreReference, which lists
 * every subgenre and already marks these as "yours"; nothing when there are
 * none. Built-in subgenres are shared by everyone and never listed here.
 *
 * Rename edits the row in place (Enter saves, Escape cancels); the name is
 * checked by the server as a new one would be, and a refusal ("Metal already
 * has Thrash Metal") shows in a toast with the field still open to fix it.
 * Delete asks first: the tracks with it keep their genre, without a subgenre.
 * Both go through useGenres, whose cached list every page reads, so the
 * library and the editor show the change without a reload.
 */
const props = defineProps<{
  /** The genres with their subgenres (useGenres), the user's own among them. */
  genres: Genre[]
}>()

// The actions; the list itself comes from the props, the same cache.
const { renameSubgenre, deleteSubgenre } = useGenres()

/** One of the user's subgenres, with the genre it belongs to. */
interface OwnSubgenre {
  genre: Genre
  subgenre: Subgenre
}

/** The user's own subgenres, by genre then by name (the genres' and the subgenres' own order). */
const own = computed<OwnSubgenre[]>(() => props.genres.flatMap(genre => genre.subgenres
  .filter(subgenre => subgenre.custom)
  .map(subgenre => ({ genre, subgenre }))))

// --- Rename -----------------------------------------------------------------------
/** The subgenre being renamed (its row shows the field), or null. */
const editingId = ref<string | null>(null)
/** The name being typed. */
const draft = ref('')
/** One rename at a time: Save spins, and the field waits. */
const renaming = useAsyncTask()

/** Opens a row's field, filled with the current name. */
function startRename(item: OwnSubgenre) {
  editingId.value = item.subgenre.id
  draft.value = item.subgenre.name
}

/** Closes the field without saving. */
function cancelRename() {
  editingId.value = null
}

/**
 * Saves the typed name; an unchanged one just closes the field. On a refusal
 * the toast says why and the field stays open, with what was typed.
 */
async function saveRename(item: OwnSubgenre) {
  // The name as it will be stored.
  const name = draft.value.trim()
  if (!name) return
  if (name === item.subgenre.name) {
    cancelRename()
    return
  }
  const saved = await renaming.run(async () => {
    await renameSubgenre(item.subgenre.id, name)
  }, 'Subgenre not renamed')
  if (saved) cancelRename()
}

// --- Delete -----------------------------------------------------------------------
/** The subgenre the confirmation is about (kept while the dialog closes), or null. */
const pending = ref<OwnSubgenre | null>(null)
/** The confirmation is open. */
const deleteOpen = ref(false)
/** The deletion is running: the dialog is locked meanwhile. */
const deleting = useAsyncTask()
// Confirms the deletion.
const toast = useToast()

/** Asks before deleting a subgenre. */
function askDelete(item: OwnSubgenre) {
  pending.value = item
  deleteOpen.value = true
}

/** Deletes the subgenre asked about, then closes the dialog and says so. */
async function confirmDelete() {
  // The subgenre the dialog is about (it cannot change while it is open).
  const item = pending.value
  if (!item) return
  const deleted = await deleting.run(async () => {
    await deleteSubgenre(item.subgenre.id)
  }, 'Subgenre not deleted')
  if (!deleted) return
  deleteOpen.value = false
  toast.add({ title: `${item.subgenre.name} deleted`, icon: 'i-lucide-check', color: 'success' })
}
</script>

<template>
  <section
    v-if="own.length"
    class="space-y-2"
    aria-labelledby="own-subgenres-title"
    data-testid="own-subgenres"
  >
    <h3
      id="own-subgenres-title"
      class="font-medium text-highlighted"
    >
      Your subgenres
    </h3>
    <p class="text-muted">
      Created by you in the editor or by an import. Rename one to fix its spelling; delete one you no longer need,
      and its tracks keep their genre.
    </p>
    <ul class="divide-y divide-default rounded-lg border border-default">
      <li
        v-for="item in own"
        :key="item.subgenre.id"
        class="flex min-h-11 items-center gap-2 px-3 py-1.5"
        data-testid="own-subgenre"
      >
        <!-- Renaming: the genre stays (a subgenre cannot move), the name in a field -->
        <form
          v-if="editingId === item.subgenre.id"
          class="flex min-w-0 flex-1 flex-wrap items-center gap-2"
          @submit.prevent="saveRename(item)"
        >
          <span class="shrink-0 text-muted">{{ item.genre.name }} ›</span>
          <UInput
            v-model="draft"
            :maxlength="60"
            autofocus
            :aria-label="`New name for ${item.subgenre.name}`"
            :disabled="renaming.running"
            class="min-w-40 flex-1"
            data-testid="own-subgenre-name"
            @keydown.esc.prevent="cancelRename"
          />
          <div class="flex gap-1">
            <UButton
              type="submit"
              label="Save"
              size="sm"
              :loading="renaming.running"
              :disabled="!draft.trim()"
              data-testid="own-subgenre-save"
            />
            <UButton
              label="Cancel"
              size="sm"
              color="neutral"
              variant="ghost"
              :disabled="renaming.running"
              @click="cancelRename"
            />
          </div>
        </form>

        <!-- Shown: genre › name, then Rename and Delete -->
        <template v-else>
          <span
            class="min-w-0 flex-1 truncate"
            data-testid="own-subgenre-label"
          ><span class="text-muted">{{ item.genre.name }} › </span>{{ item.subgenre.name }}</span>
          <IconButton
            icon="i-lucide-pencil"
            :label="`Rename ${item.subgenre.name}`"
            color="neutral"
            variant="ghost"
            size="sm"
            data-testid="own-subgenre-rename"
            @click="startRename(item)"
          />
          <IconButton
            icon="i-lucide-trash-2"
            :label="`Delete ${item.subgenre.name}`"
            color="neutral"
            variant="ghost"
            size="sm"
            data-testid="own-subgenre-delete"
            @click="askDelete(item)"
          />
        </template>
      </li>
    </ul>

    <!-- Deleting one: what happens to its tracks -->
    <ConfirmDialog
      v-model:open="deleteOpen"
      :title="`Delete ${pending?.subgenre.name ?? 'this subgenre'}?`"
      :description="`Tracks with it keep ${pending?.genre.name ?? 'their genre'}, without a subgenre.`"
      confirm-label="Delete"
      :loading="deleting.running"
      @confirm="confirmDelete"
    />
  </section>
</template>
