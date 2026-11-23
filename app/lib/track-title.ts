/**
 * Where a title is cut for narrow lines (TrackTitle). Versions of a song
 * differ at the end of their title ("Rain 1" and "Rain 2", "Rain (Cover)"),
 * so that end is kept whole and only what comes before it truncates.
 */

/**
 * The longest bracketed ending kept whole: "(Live at Abbey Road)" fits, a
 * longer aside would take most of a narrow line, so only its last word is kept.
 */
const MAX_BRACKETED_END = 24

/**
 * A title in two pieces: `head` (truncates) and `end` (always shown), the end
 * being a closing bracketed group ("(Cover)", "[Live at Wembley]") or else the
 * last word. A single word has no head: it truncates as a whole.
 */
export function splitTitleEnd(title: string): { head: string, end: string } {
  const text = title.trim()
  const bracketed = /^(.*\S)\s+(\([^()]*\)|\[[^[\]]*\])$/u.exec(text)
  if (bracketed && bracketed[2]!.length <= MAX_BRACKETED_END) return { head: bracketed[1]!, end: bracketed[2]! }
  const word = /^(.*\S)\s+(\S+)$/u.exec(text)
  return word ? { head: word[1]!, end: word[2]! } : { head: '', end: text }
}
