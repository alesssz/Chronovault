import type { SyncedLyricLine } from '../types/track'

/**
 * Synced lyrics: LRC parsing and serialization, active-line lookup and the
 * conversion between the sync editor's rows and the stored lines.
 *
 * LRC format reminder:
 *
 *   [ar:Artist]           ← metadata tags (ignored, except [offset:])
 *   [offset:+250]         ← shifts every line (ms; positive = earlier)
 *   [00:10.00] [Verse 1]  ← section header (kept, see below)
 *   [00:12.34] First line
 *   [00:45.10][01:30.00] Repeated chorus (several timestamps on one line)
 *
 * Section headers such as `[Intro]` or `[Verse 1]` structure the lyrics.
 * They are not synced on their own: a header takes the time of the first
 * lyric line that follows it, and is stored with `section: true`.
 *
 * Stored format (`tracks.lyrics_synced`): a JSON array of
 * `{ time, text, section? }` sorted by time, times rounded to centiseconds.
 */

/**
 * A timestamp at the start of a line: `[mm:ss]`, `[mm:ss.xx]`, `[mm:ss:xx]`
 * or with milliseconds `[mm:ss.xxx]`. Minutes may have up to 3 digits
 * (tracks longer than 99 minutes).
 */
const LEADING_TIME_TAG = /^\[(\d{1,3}):([0-5]?\d)(?:[.:](\d{1,3}))?\]/
/** Standard LRC metadata tags; anything else in brackets is a section header. */
const META_TAG = /^\[(ar|ti|al|au|by|re|ve|length|tool|offset|#)\s*:([^\]]*)\]$/i
/** A whole line made of one bracketed text, e.g. `[Chorus x2]`. */
const SECTION_TAG = /^\[[^\]]+\]$/

/** Rounds to centiseconds: the precision of LRC timestamps. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** True for section headers such as `[Intro]`, `[Verse 1]`, `[Chorus x2]` (but not metadata tags like `[ar:…]`). */
export function isSectionHeader(text: string): boolean {
  const trimmed = text.trim()
  return SECTION_TAG.test(trimmed) && !META_TAG.test(trimmed)
}

/**
 * Parses LRC text into synced lines, sorted by time.
 *
 * - Lines with several timestamps produce one entry per timestamp.
 * - Untimed section headers wait for the next timed lyric line and take its time.
 * - Timed section headers (`[00:10.00] [Verse 1]`) keep their own time.
 * - `[offset:±ms]` is applied to every line; negative results are clamped to 0.
 * - Lines without timestamps that are not headers or `[offset]` are ignored.
 */
export function parseLrc(input: string): SyncedLyricLine[] {
  // [offset:] in seconds; applied to every time at the end.
  let offsetSeconds = 0
  // Every parsed line, in file order (sorted at the end).
  const lines: SyncedLyricLine[] = []
  /** Untimed headers waiting for the next timed line. */
  let pendingSections: string[] = []

  for (const raw of input.split(/\r?\n/)) {
    // What is left of the line after each leading timestamp is consumed.
    let rest = raw.trim()
    // Every timestamp of this line (a repeated chorus has several).
    const times: number[] = []
    // The timestamp found at the start of `rest`, if any.
    let match: RegExpExecArray | null

    // Consume every leading timestamp: `[00:45.10][01:30.00] text`.
    while ((match = LEADING_TIME_TAG.exec(rest))) {
      const [, min, sec, frac] = match
      // `frac` is a decimal fraction whatever its length: "5" = 0.5 s, "05" = 0.05 s, "050" = 0.05 s.
      times.push(Number(min) * 60 + Number(sec) + (frac ? Number(`0.${frac}`) : 0))
      rest = rest.slice(match[0].length)
    }
    const text = rest.trim()

    if (times.length === 0) {
      const meta = META_TAG.exec(text)
      if (meta?.[1]?.toLowerCase() === 'offset') {
        const ms = Number.parseInt(meta[2]!.trim(), 10)
        if (Number.isFinite(ms)) offsetSeconds = ms / 1000
      }
      else if (isSectionHeader(text)) {
        pendingSections.push(text)
      }
      continue
    }

    if (isSectionHeader(text)) {
      for (const time of times) lines.push({ time, text, section: true })
      continue
    }

    for (const [i, time] of times.entries()) {
      // Pending headers belong to the first occurrence of the line only.
      if (i === 0) {
        for (const section of pendingSections) lines.push({ time, text: section, section: true })
        pendingSections = []
      }
      lines.push({ time, text })
    }
  }

  // Array.prototype.sort is stable: a header stays before the line it introduces.
  return lines
    .map(line => ({ ...line, time: round2(Math.max(0, line.time - offsetSeconds)) }))
    .sort((a, b) => a.time - b.time)
}

/** Formats seconds as an LRC timestamp: `83.456` → `01:23.46`. */
export function formatLrcTimestamp(seconds: number): string {
  // Work in whole centiseconds so rounding never produces "60" seconds.
  const centis = Math.round(Math.max(0, seconds) * 100)
  const m = Math.floor(centis / 6000)
  const s = Math.floor((centis % 6000) / 100)
  const c = centis % 100
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`
}

/**
 * Serializes synced lines as LRC, one `[mm:ss.xx] text` per line, sorted by time.
 * Section headers are written as timed headers, so `parseLrc` reads them back
 * unchanged (round trip).
 */
export function serializeLrc(lines: SyncedLyricLine[]): string {
  return [...lines]
    .sort((a, b) => a.time - b.time)
    .map(line => `[${formatLrcTimestamp(line.time)}] ${line.text}`.trimEnd())
    .join('\n')
}

/**
 * Index of the last lyric line (not a section header) that has already
 * started at `time` (binary search), or -1 when none has started yet.
 * `lines` must be sorted by time.
 *
 * Called on every animation frame while playing, hence the O(log n) search.
 */
export function findActiveLineIndex(lines: readonly SyncedLyricLine[], time: number): number {
  // Classic binary search over the sorted times.
  let lo = 0
  let hi = lines.length - 1
  let found = -1
  while (lo <= hi) {
    // Unsigned shift: integer midpoint without overflow.
    const mid = (lo + hi) >>> 1
    if (lines[mid]!.time <= time) {
      found = mid
      lo = mid + 1
    }
    else {
      hi = mid - 1
    }
  }
  // A header shares its time with the line it introduces and sorts before it:
  // step back over headers so only real lyric lines are highlighted.
  while (found >= 0 && lines[found]!.section) found--
  return found
}

/** A row of the sync editor: a lyric line (to stamp) or a section header. */
export interface SyncRow {
  text: string
  /** Start time in seconds; `null` while the line has not been synced yet. */
  time: number | null
  section?: boolean
}

/**
 * Rows to sync, taken from the plain lyrics: lyric lines and section headers
 * in their original order (empty lines are dropped).
 */
export function syncRowsFromLyrics(lyrics: string | null | undefined): SyncRow[] {
  if (!lyrics) return []
  return lyrics
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== '')
    .map(text => (isSectionHeader(text) ? { text, time: null, section: true } : { text, time: null }))
}

/**
 * Turns editor rows into stored synced lines, sorted by time.
 * Lyric lines need a time; a section header takes the time of the lyric line
 * right after it, and is left out until that line is synced.
 */
export function buildSyncedLines(rows: readonly SyncRow[]): SyncedLyricLine[] {
  // Synced lines in row order; headers are pushed right before their line.
  const lines: SyncedLyricLine[] = []
  rows.forEach((row, i) => {
    if (row.section) {
      const next = rows.slice(i + 1).find(r => !r.section)
      if (next?.time != null) lines.push({ time: round2(next.time), text: row.text, section: true })
    }
    else if (row.time != null) {
      lines.push({ time: round2(row.time), text: row.text })
    }
  })
  // Stable sort: headers pushed before their line keep that order at equal times.
  return lines.sort((a, b) => a.time - b.time)
}
