import type { MaybeRefOrGetter } from 'vue'

/**
 * Swipe gestures on the track area of the player bar, as in phone music
 * apps: swipe left for the next track, right for the previous one, up to
 * open the full-screen view.
 *
 * While the finger moves sideways the track area follows it (`offset`), so
 * the gesture is visible before it commits; released far enough (or
 * flicked) it triggers, otherwise it springs back. Where there is nothing to
 * go to (no next track) it still follows, but stiffly, and does nothing.
 *
 * The direction is decided once per touch, on the first clear movement:
 * sideways or up, never both. Touch events only (VueUse's useSwipe): a mouse
 * never triggers it, so the desktop is unaffected. The element should have
 * `touch-action: none` (Tailwind `touch-none`), so the browser neither
 * scrolls the page nor navigates while the finger is on it; a plain tap
 * still clicks.
 */

/** Released this far sideways or up (px), the gesture triggers. */
const TRIGGER_DISTANCE = 80
/** Or a quicker flick: this speed (px/ms) triggers it even when shorter. */
const TRIGGER_SPEED = 0.5
/** Before this (px) the movement is not a gesture yet (a tap, or finger jitter). */
const START_THRESHOLD = 10
/** How much the area follows the finger towards a direction that leads nowhere. */
const STIFFNESS = 0.25

export interface TrackSwipeOptions {
  /** There is a next track to swipe to (left). */
  canNext: MaybeRefOrGetter<boolean>
  /** Swiped left. */
  onNext: () => void
  /** Swiped right (the ⏮ button's behaviour: restart, or the previous track). */
  onPrevious: () => void
  /** Swiped up. */
  onOpen: () => void
}

export function useTrackSwipe(
  target: MaybeRefOrGetter<HTMLElement | null | undefined>,
  options: TrackSwipeOptions,
) {
  /** How far the area follows the finger sideways (px; negative = left), 0 at rest. */
  const offset = ref(0)
  /** The finger is down and the gesture is under way (no transition then). */
  const dragging = ref(false)

  /** This touch's direction, decided on its first clear movement. */
  let axis: 'x' | 'y' | null = null
  /** When the touch started (ms), for the flick speed. */
  let startedAt = 0

  const { lengthX, lengthY } = useSwipe(target, {
    threshold: START_THRESHOLD,
    // Passive: `touch-action: none` on the element already stops the browser's own handling.
    passive: true,
    onSwipeStart(event) {
      axis = null
      startedAt = event.timeStamp
    },
    onSwipe() {
      // useSwipe measures start minus current: positive lengthX = moved left, positive lengthY = moved up.
      axis ??= Math.abs(lengthX.value) > Math.abs(lengthY.value) ? 'x' : 'y'
      dragging.value = true
      if (axis !== 'x') return
      const moved = -lengthX.value
      // Towards the next track with none left: follow stiffly, to show there is nothing there.
      const blocked = moved < 0 && !toValue(options.canNext)
      offset.value = blocked ? moved * STIFFNESS : moved
    },
    onSwipeEnd(event) {
      if (!dragging.value) return
      dragging.value = false
      const elapsed = Math.max(1, event.timeStamp - startedAt)
      if (axis === 'x') {
        const moved = -lengthX.value
        const far = Math.abs(moved) >= TRIGGER_DISTANCE || Math.abs(moved) / elapsed >= TRIGGER_SPEED
        if (far && moved < 0 && toValue(options.canNext)) options.onNext()
        else if (far && moved > 0) options.onPrevious()
      }
      else if (axis === 'y') {
        const up = lengthY.value
        if (up >= TRIGGER_DISTANCE || (up > 0 && up / elapsed >= TRIGGER_SPEED)) options.onOpen()
      }
      // Back to rest in every case: after next/previous the area shows the new track in place.
      offset.value = 0
      axis = null
    },
  })

  return { offset, dragging }
}
