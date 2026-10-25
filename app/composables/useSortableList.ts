import type { Ref } from 'vue'
import type { SortableEvent } from 'sortablejs'
import { moveArrayElement, useSortable } from '@vueuse/integrations/useSortable'

/**
 * Drag and drop (mouse and touch) for a list the caller renders: rows move
 * by their handle (`<DragHandle />`, i.e. `[data-drag-handle]`). Used by the
 * playlist page and the "Up next" panel.
 *
 * SortableJS moves the DOM nodes itself: `items` (a local copy of the list)
 * is reordered to match, then `onMove(from, to)` saves the change (API call,
 * player store) once the copy is up to date.
 *
 * The list element must stay in the DOM (`v-show`, not `v-if`): SortableJS
 * binds to it once, on mount.
 */
export function useSortableList<T>(
  el: Ref<HTMLElement | null>,
  items: Ref<T[]>,
  onMove: (from: number, to: number) => void,
): void {
  // SortableJS on the list, dragged by the handles only.
  useSortable(el, items, {
    handle: '[data-drag-handle]',
    animation: 150,
    onUpdate: (event: SortableEvent) => {
      // Where the item was and where it was dropped.
      const { oldIndex: from, newIndex: to } = event
      if (from == null || to == null || from === to) return
      moveArrayElement(items, from, to, event)
      // moveArrayElement applies the move on the next tick.
      void nextTick(() => onMove(from, to))
    },
  })
}
