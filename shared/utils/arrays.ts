/**
 * Array helpers for ordered lists the user edits (play queue, playlist
 * tracks). Auto-imported (Nuxt scans `shared/utils`).
 */

/**
 * A copy of `list` with the item at `from` moved to `to` (the other items
 * shift to make room). The original is never mutated, so watchers see a new
 * array; out-of-range positions return an unchanged copy.
 */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  // A new array: the caller's list is never changed.
  const copy = [...list]
  if (from < 0 || from >= copy.length || to < 0 || to >= copy.length) return copy
  // Remove, then insert at the target: the classic array move.
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item!)
  return copy
}
