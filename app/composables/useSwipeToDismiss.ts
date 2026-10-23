import type { MaybeRefOrGetter } from 'vue'

/**
 * "Pull down to close" for a full-screen view on touch screens, like the
 * now-playing screen of phone music apps: the view follows the finger down
 * and closes when released far enough (or flicked), otherwise it springs
 * back.
 *
 * The gesture only starts when it cannot be confused with something else:
 * - the view's scrolling area is at its top (otherwise the finger scrolls
 *   the content back up, as usual);
 * - the touch did not start on an element marked `data-swipe-ignore`
 *   (things that react to dragging by themselves: the waveform, sliders,
 *   the lyrics, which scroll on their own);
 * - the movement is mostly downwards.
 *
 * Touch events only (VueUse's useSwipe): a mouse never starts it, so the
 * desktop is unaffected.
 *
 * Returns `offset`, how far the view should be moved down (px), and
 * `dragging`, true while the finger is down (no transition then, so the view
 * sticks to the finger; on release a transition animates the spring back).
 */

/** Released this far down (px), the view closes. */
const DISMISS_DISTANCE = 120
/** Or a quicker flick: this speed (px/ms) closes it even when shorter. */
const DISMISS_SPEED = 0.5
/** Before this (px) the movement is not a gesture yet (a tap, or finger jitter). */
const START_THRESHOLD = 10

export interface SwipeToDismissOptions {
  /** The scrolling area inside the view: the gesture only starts when it is at its top. */
  scroller: MaybeRefOrGetter<HTMLElement | null | undefined>
  /** Closes the view (called once, on release past the distance or after a flick). */
  onDismiss: () => void
}

export function useSwipeToDismiss(
  target: MaybeRefOrGetter<HTMLElement | null | undefined>,
  options: SwipeToDismissOptions,
) {
  /** How far down the view is pulled (px), 0 at rest. */
  const offset = ref(0)
  /** The finger is down and dragging the view. */
  const dragging = ref(false)

  /** This touch may become a pull-down (checked once, when it starts). */
  let armed = false
  /** When the touch started (ms), for the flick speed. */
  let startedAt = 0

  const { lengthX, lengthY } = useSwipe(target, {
    threshold: START_THRESHOLD,
    // Passive: the gesture never needs to cancel the browser's scrolling, because it only
    // runs while the content is at its top, where there is nothing above to scroll to.
    passive: true,
    onSwipeStart(event) {
      const start = event.target as Element | null
      armed = (toValue(options.scroller)?.scrollTop ?? 0) <= 0
        && !start?.closest('[data-swipe-ignore]')
      startedAt = event.timeStamp
    },
    onSwipe() {
      if (!armed) return
      // useSwipe measures start minus current: a downward pull has a negative lengthY.
      const down = -lengthY.value
      // Sideways or upwards: not this gesture (and it stays off until the next touch).
      if (!dragging.value && (down <= 0 || Math.abs(lengthX.value) > down)) {
        armed = false
        return
      }
      dragging.value = true
      offset.value = Math.max(0, down)
    },
    onSwipeEnd(event) {
      if (!dragging.value) return
      dragging.value = false
      const elapsed = Math.max(1, event.timeStamp - startedAt)
      const pulled = offset.value
      if (pulled >= DISMISS_DISTANCE || pulled / elapsed >= DISMISS_SPEED) {
        // The view closes from where it is (its offset is reset on the next opening, see reset).
        options.onDismiss()
      }
      else {
        // Not far enough: spring back (the transition runs now that dragging is false).
        offset.value = 0
      }
    },
  })

  /** Back to rest, e.g. when the view opens again. */
  function reset(): void {
    offset.value = 0
    dragging.value = false
    armed = false
  }

  return { offset, dragging, reset }
}
