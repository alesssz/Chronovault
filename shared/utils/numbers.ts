/**
 * Numeric helpers shared by the player, the audio engine and the cover
 * editor. Auto-imported (Nuxt scans `shared/utils`).
 */

/** `value` limited to [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
