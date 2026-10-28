/** Hours an orphaned file must have lived before the clean-up deletes it, when nothing valid is configured. */
const DEFAULT_MIN_AGE_HOURS = 24

/**
 * Minimum age (hours) of an orphaned file before the clean-up deletes it,
 * from runtime config (`NUXT_STORAGE_CLEANUP_MIN_AGE_HOURS`, default 24).
 * Invalid values fall back to the default rather than deleting fresh uploads.
 */
export function orphanMinAgeHours(): number {
  return parseMinAgeHours(useRuntimeConfig().storageCleanup?.minAgeHours)
}

/**
 * The setting as Nitro hands it over: a number, or the variable's text
 * (Nitro parses it with `destr`). Only a number, or text holding one, is a
 * setting: a variable left empty used to become `Number('') = 0`, and the
 * same for `' '`, `'null'` (null) and `'false'`; `'true'` became 1. Any of
 * them made every orphan deletable at once, the file of an upload still
 * running in another tab included. Exported for the unit tests.
 */
export function parseMinAgeHours(raw: unknown): number {
  // The configured hours (NaN when the setting holds no number).
  const value = typeof raw === 'number'
    ? raw
    : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_MIN_AGE_HOURS
}
