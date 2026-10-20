import type { SyncedLyricLine } from '../types/track'

/**
 * Synced lyrics in LRC format.
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
 */

const LEADING_TIME_TAG = /^\[(\d{1,3}):([0-5]?\d)(?:[.:](\d{1,3}))?\]/
/** Standard LRC metadata tags; anything else in brackets is a section header. */
const META_TAG = /^\[(ar|ti|al|au|by|re|ve|length|tool|offset|#)\s*:([^\]]*)\]$/i
const SECTION_TAG = /^\[[^\]]+\]$/

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** True for section headers such as `[Intro]`, `[Verse 1]`, `[Chorus x2]`. */
export function isSectionHeader(text: string): boolean {
  const trimmed = text.trim()
  return SECTION_TAG.test(trimmed) && !META_TAG.test(trimmed)
}

export function parseLrc(input: string): SyncedLyricLine[] {
  let offsetSeconds = 0
  const lines: SyncedLyricLine[] = []
  /** Untimed headers waiting for the next timed line. */
  let pendingSections: string[] = []

  for (const raw of input.split(/\r?\n/)) {
    let rest = raw.trim()
    const times: number[] = []
    let match: RegExpExecArray | null

    while ((match = LEADING_TIME_TAG.exec(rest))) {
      const [, min, sec, frac] = match
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

/** `83.456` → `01:23.46` */
export function formatLrcTimestamp(seconds: number): string {
  const centis = Math.round(Math.max(0, seconds) * 100)
  const m = Math.floor(centis / 6000)
  const s = Math.floor((centis % 6000) / 100)
  const c = centis % 100
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`
}

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
 */
export function findActiveLineIndex(lines: readonly SyncedLyricLine[], time: number): number {
  let lo = 0
  let hi = lines.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    if (lines[mid]!.time <= time) {
      found = mid
      lo = mid + 1
    }
    else {
      hi = mid - 1
    }
  }
  while (found >= 0 && lines[found]!.section) found--
  return found
}

/** A row of the sync editor: a lyric line (to stamp) or a section header. */
export interface SyncRow {
  text: string
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
  return lines.sort((a, b) => a.time - b.time)
}
