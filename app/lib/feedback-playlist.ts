import { foldCase } from '~~/shared/utils/text'

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
  const [first = '', ...rest] = texts
  let length = first.length
  for (const text of rest) {
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
  let base = commonPrefix(titles)
  // Strip dangling separators and markers until nothing changes ("Night drive (v" → "Night drive").
  for (let previous = ''; previous !== base;) {
    previous = base
    base = base.replace(DANGLING, '')
  }
  if (base.trim().length < 3) base = titles[0]!
  return `${base.trim().slice(0, MAX_TITLE - SUFFIX.length)}${SUFFIX}`
}

/**
 * The song a group is about: its title without the " – versions" that
 * "Share for feedback" appends (the whole title when it was renamed without it).
 */
export function groupSongName(groupTitle: string): string {
  const title = groupTitle.trim()
  return title.toLowerCase().endsWith(SUFFIX.toLowerCase()) ? title.slice(0, -SUFFIX.length).trim() : title
}

/**
 * The track's title starts with the group's song name (case folded as in
 * the search), and the name's last word ends there: "Rain 2",
 * "Rain2", "Rain (Cover)" and "Rain-2" are versions of "Rain", "Rainbow" is
 * not. A hint for sorting and pre-filling, never a rule: versions with
 * another title can still join.
 */
export function isVersionOf(trackTitle: string, groupTitle: string): boolean {
  const song = foldCase(groupSongName(groupTitle))
  const title = foldCase(trackTitle)
  if (!song || !title.startsWith(song)) return false
  // A letter right after the name continues its last word ("Rain" → "Rainbow").
  const next = title.charAt(song.length)
  return !/\p{L}/u.test(next) || !/\p{L}$/u.test(song)
}
