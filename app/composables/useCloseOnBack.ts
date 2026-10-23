import type { MaybeRefOrGetter } from 'vue'

/**
 * The Android back button (or back gesture) closes the panel or dialog on
 * top, instead of leaving the page or the installed app.
 *
 * Built on the browser's CloseWatcher API, made for exactly this: while a
 * watcher is active, the next "close request" (Android back, or Esc on a
 * desktop keyboard) goes to the most recently created watcher instead of
 * navigating. Nothing is pushed into the browser history, so the router,
 * links that navigate away while a panel is open (e.g. "Edit track" from the
 * full-screen player) and the history itself are never touched.
 *
 * Supported by Chromium browsers (Chrome, Opera, Edge, Samsung Internet).
 * Elsewhere `CloseWatcher` does not exist and nothing changes: Firefox for
 * Android keeps its old behaviour, and iPhone/iPad have no back button.
 *
 * Usage: `useCloseOnBack(() => open.value, () => { open.value = false })`.
 * Nested overlays stack naturally: they open one after the other, so their
 * watchers are created in that order and back closes the newest first.
 */

/**
 * The part of the CloseWatcher API used here. TypeScript's DOM library does
 * not describe it yet, so it is declared locally.
 */
interface CloseWatcherLike {
  /** Fired when the user asks to close (Android back, Esc); the watcher is then spent. */
  onclose: ((event: Event) => void) | null
  /** Deactivates the watcher without a close request (the overlay closed by itself). */
  destroy: () => void
}
type CloseWatcherConstructor = new () => CloseWatcherLike

/** The browser's CloseWatcher constructor, or null where it is not available (or on the server). */
function closeWatcherClass(): CloseWatcherConstructor | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { CloseWatcher?: CloseWatcherConstructor }).CloseWatcher ?? null
}

/**
 * Time of the last Esc keydown (performance.now()), shared by every watcher.
 *
 * Why it matters: on a desktop keyboard Esc is a close request too, so it
 * would reach the watcher of the topmost *watched* overlay. But Nuxt UI
 * (Reka UI) already closes its topmost layer on Esc, and that layer may be
 * something unwatched on top (a dropdown menu inside the Up next panel):
 * the watcher would then close the panel as well, one Esc closing two
 * layers. So a close request that arrives right after an Esc keydown is
 * left to Nuxt UI, and only the others (Android back) close the overlay.
 */
let lastEscapeAt = Number.NEGATIVE_INFINITY
/** The Esc listener is installed once, on first use in the browser. */
let escapeListening = false
/** A close request this soon after an Esc keydown (ms) comes from that key. */
const ESCAPE_WINDOW_MS = 500

/** Starts recording Esc keydowns (capture phase: before any handler can stop them). */
function listenForEscape(): void {
  if (escapeListening || typeof window === 'undefined') return
  escapeListening = true
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') lastEscapeAt = performance.now()
  }, { capture: true })
}

/**
 * Closes an overlay on the Android back button while it is open.
 *
 * @param isOpen whether the overlay is open (a ref or a getter).
 * @param close closes it. It may refuse (a dialog locked while saving): the
 *   watcher is then armed again, so the next back press is caught too.
 */
export function useCloseOnBack(isOpen: MaybeRefOrGetter<boolean>, close: () => void): void {
  const available = closeWatcherClass()
  // Server, or a browser without the API: keep today's behaviour.
  if (!available) return
  // Narrowed once here, so the closures below see a constructor, never null.
  const CloseWatcherClass: CloseWatcherConstructor = available
  listenForEscape()

  /** The active watcher while the overlay is open, null otherwise. */
  let watcher: CloseWatcherLike | null = null

  /** Creates the watcher (once per opening). */
  function arm(): void {
    if (watcher) return
    const created = new CloseWatcherClass()
    created.onclose = () => {
      // A watcher fires once and is then spent: forget it.
      watcher = null
      // Esc on a keyboard: Nuxt UI closes the right layer by itself (see lastEscapeAt).
      if (performance.now() - lastEscapeAt > ESCAPE_WINDOW_MS) close()
      // Still open (Esc closed a layer above it, or close() was refused):
      // arm again once Vue has applied the change, for the next back press.
      void nextTick(() => {
        if (toValue(isOpen)) arm()
      })
    }
    watcher = created
  }

  /** Drops the watcher: the overlay was closed some other way (button, overlay click, navigation). */
  function disarm(): void {
    watcher?.destroy()
    watcher = null
  }

  watch(() => toValue(isOpen), open => (open ? arm() : disarm()), { immediate: true })
  // The component goes away while open (e.g. a page change): no stale watcher left behind.
  onScopeDispose(disarm)
}
