/**
 * Short vibrations as touch feedback ("haptics"), for actions done without
 * looking at the screen, such as stamping lyric lines while listening.
 *
 * Uses the Vibration API, which Android browsers support. Elsewhere (iPhone,
 * iPad, most desktops) `navigator.vibrate` is missing and the call does
 * nothing, so callers never need to check. Browsers also ignore it without a
 * recent user gesture, which is always the case here (a tap or a key press).
 */

/** Patterns, in milliseconds (vibrate, pause, vibrate…). */
export const HAPTIC = {
  /** One short tick: something was done (a line stamped). */
  tick: 15,
  /** Two short ticks: something was undone. */
  undo: [10, 60, 10],
} as const

/** Vibrates with a pattern, where the device can; never throws. */
export function haptic(pattern: number | readonly number[]): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(pattern as number | number[])
  }
  catch {
    // Blocked by the browser (e.g. inside a cross-origin frame): feedback is optional.
  }
}
