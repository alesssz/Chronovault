import type { MaybeRefOrGetter } from 'vue'

/** Held this long (ms) without moving, a touch is a long press (Android's own is about 500 ms). */
const LONG_PRESS_MS = 450
/** A finger that moves further (px) is scrolling or swiping, not pressing. */
const MOVE_TOLERANCE = 10

/** What a long press does, and where it never starts. */
export interface LongPressOptions {
  /**
   * The finger was held: `element` is where it landed. Returning false
   * declines it (nothing there to press), and the touch goes on as a tap.
   */
  onLongPress: (element: Element) => boolean | undefined
  /** A selector: touches starting inside a match never become long presses (menus, checkboxes). */
  ignore?: string
}

/**
 * A long press on touch screens, as photo galleries and file managers use it
 * to start selecting. One set of listeners on `target` serves everything
 * inside it, so rows drawn and dropped by a virtual list need no listeners
 * of their own.
 *
 * Touch only (pointer events whose pointerType is "touch"): a mouse keeps its
 * clicks and its right-click menu. The press is dropped as soon as the finger
 * moves beyond a few pixels or the browser takes the touch over to scroll
 * (pointercancel), so a scroll that starts slowly never selects anything.
 * Once it fires, the click that follows the finger's release is swallowed:
 * it would otherwise act as a tap on what was pressed (play the track, untick
 * it). While a finger is down, the browser's own long-press menu (an image's
 * "Save image", text selection) is kept away; the element should also have
 * `user-select: none` on touch screens (Tailwind `pointer-coarse:select-none`).
 */
export function useLongPress(target: MaybeRefOrGetter<HTMLElement | null | undefined>, options: LongPressOptions): void {
  /** The pending long press, until it fires or the touch ends or moves. */
  let timer: ReturnType<typeof setTimeout> | undefined
  /** Where the finger landed (px, viewport). */
  let startX = 0
  let startY = 0
  /** A finger is down inside the target. */
  let touching = false
  /** The current touch became a long press: its closing click is not a tap. */
  let fired = false

  /** Drops the pending long press. */
  function cancel(): void {
    clearTimeout(timer)
    timer = undefined
  }

  useEventListener(target, 'pointerdown', (event: PointerEvent) => {
    // A new touch: whatever the last one left behind is over.
    fired = false
    cancel()
    if (event.pointerType !== 'touch' || !event.isPrimary) return
    // Where the finger landed.
    const element = event.target as Element
    if (options.ignore && element.closest(options.ignore)) return
    touching = true
    startX = event.clientX
    startY = event.clientY
    timer = setTimeout(() => {
      timer = undefined
      fired = options.onLongPress(element) !== false
    }, LONG_PRESS_MS)
  })
  // Moving is scrolling or swiping.
  useEventListener(target, 'pointermove', (event: PointerEvent) => {
    if (timer && Math.hypot(event.clientX - startX, event.clientY - startY) > MOVE_TOLERANCE) cancel()
  })
  // The finger lifted, or the browser took the touch over (scrolling).
  for (const type of ['pointerup', 'pointercancel'] as const) {
    useEventListener(target, type, () => {
      touching = false
      cancel()
    })
  }
  // The click that ends a long press: swallowed before anything inside sees it.
  useEventListener(target, 'click', (event: MouseEvent) => {
    if (!fired) return
    fired = false
    event.preventDefault()
    event.stopPropagation()
  }, { capture: true })
  // The browser's own long-press menu, for touches only.
  useEventListener(target, 'contextmenu', (event: Event) => {
    if (touching || fired) event.preventDefault()
  })
  onScopeDispose(cancel)
}
