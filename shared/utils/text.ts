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
 * The first letter or digit of the first `max` words, in upper case: `initials('Road trip')` →
 * `RT`, `initials('Punic Wars — full album')` → `PW`. A word without one (a dash, an emoji)
 * is skipped; `''` when there is none. For covers that have no image of their own.
 */
export function initials(text: string, max = 2): string {
  return text.split(/\s+/)
    .map(word => Array.from(word).find(char => /[\p{L}\p{N}]/u.test(char)))
    .filter(Boolean)
    .slice(0, max)
    .join('')
    .toLocaleUpperCase('en')
}

/**
 * The parts that are set, joined: `joinParts(['Album', null, 2026])` →
 * `Album · 2026`. Used for "Album · Year · Genre" lines; `''` when none is set.
 */
export function joinParts(parts: readonly (string | number | null | undefined)[], separator = ' · '): string {
  return parts.filter(part => part != null && part !== '').join(separator)
}

/**
 * Comparison key for case-insensitive matches (search, genre names, the
 * metadata import's titles): trimmed and lower-cased with English rules, so it
 * is the same on every device, and in Unicode's composed form (NFC). An
 * accented letter can be one character or a letter plus a combining accent:
 * titles read from file tags on macOS often come in the second form, typed
 * text in the first, and a typed "Forlì" must match the one a tag gave.
 */
export function foldCase(text: string): string {
  return text.normalize('NFC').trim().toLocaleLowerCase('en')
}

/**
 * A value worth showing or writing: set and not blank once printed
 * (`0` counts, `''`, `'  '`, null and undefined do not). Tag writers leave
 * the other fields out of downloaded files.
 */
export function hasText(value: unknown): boolean {
  return value != null && String(value).trim() !== ''
}
