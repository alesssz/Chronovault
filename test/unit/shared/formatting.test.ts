/**
 * Time and size formatting shown in the UI.
 */
import { describe, expect, it } from 'vitest'
import { formatAge, formatBytes, formatRemaining, formatTime } from '~~/shared/utils/time'

describe('formatTime', () => {
  it.each([
    [0, '0:00'],
    [9.9, '0:09'],
    [65, '1:05'],
    [3600, '1:00:00'],
    [3725, '1:02:05'],
    [null, '0:00'],
    [Number.NaN, '0:00'],
    [-5, '0:00'],
  ])('%s → %s', (input, expected) => {
    expect(formatTime(input)).toBe(expected)
  })
})

describe('formatRemaining', () => {
  it('shows the remaining time with a minus sign', () => {
    expect(formatRemaining(30, 200)).toBe('-2:50')
  })

  it('never goes below zero', () => {
    expect(formatRemaining(250, 200)).toBe('-0:00')
  })
})

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1536, '1.5 KB'],
    [34 * 1024 * 1024, '34.0 MB'],
  ])('%s → %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected)
  })
})

describe('formatAge', () => {
  // "Now" for every case below.
  const now = Date.parse('2026-10-21T12:00:00Z')
  it.each([
    ['2026-10-21T11:59:30Z', 'just now'],
    ['2026-10-21T11:55:00Z', '5 minutes ago'],
    ['2026-10-21T09:00:00Z', '3 hours ago'],
    ['2026-10-20T11:00:00Z', 'yesterday'],
    ['2026-10-09T12:00:00Z', '12 days ago'],
  ])('%s → %s', (iso, expected) => {
    expect(formatAge(iso, now)).toBe(expected)
  })
})
