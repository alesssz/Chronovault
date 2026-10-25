/**
 * "Share for feedback" (library selection): the chosen versions of a track
 * go into a new unlisted playlist whose link is sent to friends. This module
 * names that playlist after what the versions have in common:
 *
 *   "Night drive v1", "Night drive v2"         → "Night drive – versions"
 *   "Rain (acoustic)", "Rain (piano)"          → "Rain – versions"
 *   "Night drive", "Something else"            → "Night drive – versions"
 */

/** Longest a playlist title may be (playlistMetadataSchema). */
const MAX_TITLE = 200
/** Appended to the common name. */
const SUFFIX = ' – versions'

/**
 * What is left dangling at the end of a common prefix: separators and
 * opening brackets, or the start of a version marker ("v", "ver", "take"…)
 * cut before its number or name.
 */
const DANGLING = /(?:[\s\-–—_.,:#([]+|\s(?:v|ver|version|take|alt|mix)\.?)$/i

/** The longest common start of all texts (compared ignoring case; the first text's casing is kept). */
function commonPrefix(texts: string[]): string {
  // The first text is the reference; the others shorten the common part.
  const [first = '', ...rest] = texts
  // Length of the start shared so far.
  let length = first.length
  for (const text of rest) {
    // How far this text agrees with the first one.
    let i = 0
    while (i < length && i < text.length && first[i]!.toLowerCase() === text[i]!.toLowerCase()) i++
    length = i
  }
  return first.slice(0, length)
}

/**
 * Title of the feedback playlist for these track titles: their common
 * name + " – versions", or the first title when they share nothing useful
 * (fewer than 3 characters in common).
 */
export function feedbackPlaylistTitle(titles: string[]): string {
  if (!titles.length) return 'Versions'
  // What every title starts with, trimmed below.
  let base = commonPrefix(titles)
  // Strip dangling separators and markers until nothing changes ("Night drive (v" → "Night drive").
  for (let previous = ''; previous !== base;) {
    previous = base
    base = base.replace(DANGLING, '')
  }
  if (base.trim().length < 3) base = titles[0]!
  return `${base.trim().slice(0, MAX_TITLE - SUFFIX.length)}${SUFFIX}`
}
