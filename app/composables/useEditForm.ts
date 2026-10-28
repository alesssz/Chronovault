/**
 * State of an edit form saved with a "Save" button (track editor, playlist
 * page): the reactive values bound to the inputs, whether they differ from
 * the last saved ones, and a confirmation before leaving the page with
 * unsaved changes: for a page of the app (the router) and for leaving the app
 * itself (reload, closed tab: the browser's own beforeunload question).
 *
 * "Dirty" compares JSON snapshots: forms are small, and it catches every
 * kind of change (texts, numbers, arrays of synced lines) without a deep watcher.
 *
 * A save takes a while. UForm disables its inputs meanwhile, but not
 * everything that writes into the form: the Sync tab's keys go on stamping
 * lines (Space). When the answer comes, the server's values go back only
 * into the fields left alone since the save was sent (snapshot(), then
 * reset(values, sent)); a field changed meanwhile keeps the newer value and
 * stays unsaved, so "Save" and the leave-page warning still see it. The
 * server's copy used to replace the whole form and mark it clean: such an
 * edit was lost without a word.
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

  /** The form's values now, to hand to reset() once the save they are sent with answers. */
  function snapshot(): string {
    return JSON.stringify(state)
  }

  /**
   * Takes the server's values back (normalized: trimmed texts…) and marks
   * them saved. `sent` (snapshot(), taken when the save was sent): a field
   * changed since then keeps its newer value, and the form stays dirty for
   * it. Without `sent`, every field takes the server's value.
   */
  function reset(values: T, sent?: string): void {
    // The fields as the save sent them (none: nothing to compare with, all are replaced).
    const before = sent ? JSON.parse(sent) as Record<string, unknown> : null
    // What is saved now, in the form's own key order (the baseline is compared as JSON).
    const saved: Record<string, unknown> = {}
    for (const key of Object.keys(state) as (keyof T & string)[]) {
      // The server's value of this field (the form's own when the server has none).
      const fromServer = key in values ? values[key] : state[key]
      saved[key] = fromServer
      // Changed while the save was on its way: the newer value stays, unsaved.
      if (before && JSON.stringify(state[key]) !== JSON.stringify(before[key])) continue
      state[key] = fromServer
    }
    baseline.value = JSON.stringify(saved)
  }

  // Leaving with unsaved changes asks first (returning false cancels the navigation).
  onBeforeRouteLeave(() => {
    if (dirty.value && !window.confirm('You have unsaved changes. Leave anyway?')) return false
  })
  // So does leaving the app itself: a reload (pull-to-refresh on a phone), closing the tab or the
  // installed app. The browser shows its own question; its text cannot be set.
  useEventListener('beforeunload', (event: BeforeUnloadEvent) => {
    if (dirty.value) event.preventDefault()
  })

  return { state, dirty, markSaved, snapshot, reset }
}
