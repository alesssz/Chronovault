/**
 * Small text helpers for labels and comparisons. Auto-imported in Vue
 * templates and server code (Nuxt auto-imports `shared/utils`).
 */

/**
 * Count with its noun, singular or plural: `pluralize(1, 'track')` → `1 track`,
 * `pluralize(3, 'track')` → `3 tracks`. `plural` covers irregular nouns.
 */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/** First letter in upper case: `capitalize('version')` → `Version` (labels built from a noun). */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Cuts `text` at `max` characters, ending with an ellipsis when something was cut. */
export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/**
 * The parts that are set, joined: `joinParts(['Album', null, 2026])` →
 * `Album · 2026`. Used for "Album · Year · Genre" lines; `''` when none is set.
 */
export function joinParts(parts: readonly (string | number | null | undefined)[], separator = ' · '): string {
  return parts.filter(part => part != null && part !== '').join(separator)
}

/**
 * Comparison key for case-insensitive matches (search, genre names):
 * trimmed and lower-cased with English rules, so it is the same on every device.
 */
export function foldCase(text: string): string {
  return text.trim().toLocaleLowerCase('en')
}

/**
 * A value worth showing or writing: set and not blank once printed
 * (`0` counts, `''`, `'  '`, null and undefined do not). Tag writers leave
 * the other fields out of downloaded files.
 */
export function hasText(value: unknown): boolean {
  return value != null && String(value).trim() !== ''
}
