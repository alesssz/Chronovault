/**
 * Minimum age (hours) of an orphaned file before the clean-up deletes it,
 * from runtime config (`NUXT_STORAGE_CLEANUP_MIN_AGE_HOURS`, default 24).
 * Invalid values fall back to the default rather than deleting fresh uploads.
 */
export function orphanMinAgeHours(): number {
  const value = Number(useRuntimeConfig().storageCleanup?.minAgeHours)
  return Number.isFinite(value) && value >= 0 ? value : 24
}
