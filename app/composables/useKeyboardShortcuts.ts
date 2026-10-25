import type { MaybeRefOrGetter } from 'vue'

/**
 * Shared state of the player's keyboard shortcuts (app/lib/keyboard-shortcuts.ts,
 * app/plugins/keyboard-shortcuts.client.ts): who has claimed the keyboard,
 * and whether the list of shortcuts is open.
 */

/**
 * How many components have claimed the keyboard right now: while any has,
 * the shortcuts do nothing. A count, not a flag, so two claims overlapping
 * (one ending as the other starts) never leave the keys unguarded.
 */
export function useKeyboardClaims() {
  return useState('keyboard-claims', () => 0)
}

/**
 * Claims the keyboard while `active` is true, for a component that uses the
 * keys as a whole (the lyrics sync editor: Space stamps a line, ← and →
 * nudge it). Released when `active` turns false, or when the component goes.
 */
export function useKeyboardClaim(active: MaybeRefOrGetter<boolean>): void {
  // The shared count of claims.
  const claims = useKeyboardClaims()
  /** This component's own claim is counted. */
  let claimed = false

  /** Adds or removes this component's claim, once each. */
  function set(on: boolean) {
    if (on === claimed) return
    claimed = on
    claims.value += on ? 1 : -1
  }

  // Claims or releases as `active` changes; `immediate`: active from the start.
  watch(() => toValue(active), set, { immediate: true })
  // A component that goes away while claiming gives the keys back.
  onBeforeUnmount(() => set(false))
}

/** The list of shortcuts is open (the `?` key, or the account menu). */
export function useShortcutsHelp() {
  return useState('keyboard-shortcuts-help', () => false)
}
