/**
 * State of an edit form saved with a "Save" button (track editor, playlist
 * page): the reactive values bound to the inputs, whether they differ from
 * the last saved ones, and a confirmation before leaving the page with
 * unsaved changes.
 *
 * "Dirty" compares JSON snapshots: forms are small, and it catches every
 * kind of change (texts, numbers, arrays of synced lines) without a deep watcher.
 */
export function useEditForm<T extends object>(initial: T) {
  /** The form, bound to the inputs. */
  const state = reactive(initial) as T
  /** Snapshot of the last saved state: `dirty` compares against it. */
  const baseline = ref(JSON.stringify(state))
  /** Unsaved changes: enables "Save" and the leave-page warning. */
  const dirty = computed(() => JSON.stringify(state) !== baseline.value)

  /** The current values are saved (or must no longer warn, e.g. the item was deleted). */
  function markSaved(): void {
    baseline.value = JSON.stringify(state)
  }

  /** Takes the server's values back (normalized: trimmed texts…) and marks the form clean. */
  function reset(values: T): void {
    Object.assign(state, values)
    markSaved()
  }

  // Leaving with unsaved changes asks first (returning false cancels the navigation).
  onBeforeRouteLeave(() => {
    if (dirty.value && !window.confirm('You have unsaved changes. Leave anyway?')) return false
  })

  return { state, dirty, markSaved, reset }
}
