/**
 * LRC parsing/serialization, section headers, active-line lookup and sync editor rows.
 */
import { describe, expect, it } from 'vitest'
import {
  buildSyncedLines,
  findActiveLineIndex,
  formatLrcTimestamp,
  isSectionHeader,
  parseLrc,
  serializeLrc,
  syncRowsFromLyrics,
} from '~~/shared/utils/lyrics'

describe('parseLrc', () => {
  it('reads lines with hundredths timestamps', () => {
    expect(parseLrc('[00:12.34] First line\n[01:05.50] Second')).toEqual([
      { time: 12.34, text: 'First line' },
      { time: 65.5, text: 'Second' },
    ])
  })

  it('accepts milliseconds, tenths and timestamps without fraction', () => {
    expect(parseLrc('[00:01.5] a\n[00:02.250] b\n[00:03] c').map(l => l.time)).toEqual([1.5, 2.25, 3])
  })

  it('expands multiple timestamps on one line and sorts by time', () => {
    expect(parseLrc('[00:30.00][00:10.00] Chorus\n[00:20.00] Verse')).toEqual([
      { time: 10, text: 'Chorus' },
      { time: 20, text: 'Verse' },
      { time: 30, text: 'Chorus' },
    ])
  })

  it('ignores metadata tags, empty lines and untimed text', () => {
    const lrc = '[ar:Artist]\n[ti:Title]\n[length: 03:20]\n\nfree text\n[00:01.00] ok'
    expect(parseLrc(lrc)).toEqual([{ time: 1, text: 'ok' }])
  })

  it('keeps timed section headers', () => {
    expect(parseLrc('[00:10.00] [Verse 1]\n[00:10.00] First line')).toEqual([
      { time: 10, text: '[Verse 1]', section: true },
      { time: 10, text: 'First line' },
    ])
  })

  it('attaches untimed section headers to the next timed line', () => {
    expect(parseLrc('[Intro]\n[00:02.00] Hey\n[Chorus: x2]\n[00:30.00] La la')).toEqual([
      { time: 2, text: '[Intro]', section: true },
      { time: 2, text: 'Hey' },
      { time: 30, text: '[Chorus: x2]', section: true },
      { time: 30, text: 'La la' },
    ])
  })

  it('applies [offset:] (positive = lines earlier) without going below zero', () => {
    expect(parseLrc('[offset:+500]\n[00:10.00] a\n[00:00.20] b')).toEqual([
      { time: 0, text: 'b' },
      { time: 9.5, text: 'a' },
    ])
    expect(parseLrc('[offset:-1000]\n[00:10.00] a')[0]?.time).toBe(11)
  })

  it('keeps empty instrumental lines', () => {
    expect(parseLrc('[00:05.00]')).toEqual([{ time: 5, text: '' }])
  })

  it('handles Windows line endings', () => {
    expect(parseLrc('[00:01.00] a\r\n[00:02.00] b')).toHaveLength(2)
  })
})

describe('formatLrcTimestamp', () => {
  it.each([
    [0, '00:00.00'],
    [5.5, '00:05.50'],
    [83.456, '01:23.46'],
    [599.999, '10:00.00'],
    [-3, '00:00.00'],
  ])('%s → %s', (seconds, expected) => {
    expect(formatLrcTimestamp(seconds)).toBe(expected)
  })
})

describe('serializeLrc', () => {
  it('produces sorted LRC that parses back identically', () => {
    const lines = [{ time: 20, text: 'b' }, { time: 1.25, text: 'a' }]
    const lrc = serializeLrc(lines)
    expect(lrc).toBe('[00:01.25] a\n[00:20.00] b')
    expect(parseLrc(lrc)).toEqual([{ time: 1.25, text: 'a' }, { time: 20, text: 'b' }])
  })

  it('round-trips section headers', () => {
    const lines = [
      { time: 5, text: '[Intro]', section: true },
      { time: 5, text: 'Hey' },
      { time: 20, text: '[Verse 1]', section: true },
      { time: 20, text: 'First line' },
    ]
    expect(parseLrc(serializeLrc(lines))).toEqual(lines)
  })
})

describe('isSectionHeader', () => {
  it.each([
    ['[Intro]', true],
    ['  [Verse 1]  ', true],
    ['[Chorus x2]', true],
    ['[ar:Artist]', false],
    ['[offset:+200]', false],
    ['La la [la]', false],
    ['[]', false],
  ])('%s → %s', (text, expected) => {
    expect(isSectionHeader(text)).toBe(expected)
  })
})

describe('findActiveLineIndex', () => {
  const lines = [{ time: 1, text: 'a' }, { time: 5, text: 'b' }, { time: 9, text: 'c' }]

  it.each([
    [0, -1],
    [1, 0],
    [4.99, 0],
    [5, 1],
    [100, 2],
  ])('at time %s the active line is %s', (time, expected) => {
    expect(findActiveLineIndex(lines, time)).toBe(expected)
  })

  it('returns -1 without lines', () => {
    expect(findActiveLineIndex([], 10)).toBe(-1)
  })

  it('never returns a section header', () => {
    const withSections = [
      { time: 0, text: '[Intro]', section: true },
      { time: 0, text: 'Hey' },
      { time: 8, text: '[Verse 1]', section: true },
      { time: 8, text: 'First line' },
    ]
    expect(findActiveLineIndex(withSections, 9)).toBe(3)
    expect(findActiveLineIndex(withSections, 7)).toBe(1)
  })
})

describe('syncRowsFromLyrics', () => {
  it('keeps section headers in order and drops empty lines', () => {
    expect(syncRowsFromLyrics('[Verse]\none\n\n  two  \n[Chorus]\nthree')).toEqual([
      { text: '[Verse]', time: null, section: true },
      { text: 'one', time: null },
      { text: 'two', time: null },
      { text: '[Chorus]', time: null, section: true },
      { text: 'three', time: null },
    ])
  })

  it('handles missing lyrics', () => {
    expect(syncRowsFromLyrics(null)).toEqual([])
  })
})

describe('buildSyncedLines', () => {
  it('keeps only timed lines, sorted and rounded', () => {
    expect(buildSyncedLines([
      { text: 'a', time: 3.456 },
      { text: 'b', time: null },
      { text: 'c', time: 1 },
    ])).toEqual([
      { time: 1, text: 'c' },
      { time: 3.46, text: 'a' },
    ])
  })

  it('gives a section header the time of the line right after it', () => {
    expect(buildSyncedLines([
      { text: '[Intro]', time: null, section: true },
      { text: 'Hey', time: 2 },
      { text: '[Verse 1]', time: null, section: true },
      { text: 'First line', time: 12.5 },
    ])).toEqual([
      { time: 2, text: '[Intro]', section: true },
      { time: 2, text: 'Hey' },
      { time: 12.5, text: '[Verse 1]', section: true },
      { time: 12.5, text: 'First line' },
    ])
  })

  it('leaves a header out until its first line is synced', () => {
    expect(buildSyncedLines([
      { text: 'Hey', time: 2 },
      { text: '[Chorus]', time: null, section: true },
      { text: 'La la', time: null },
    ])).toEqual([{ time: 2, text: 'Hey' }])
  })
})
