/**
 * Time and size formatting shown in the UI.
 */
import { describe, expect, it } from 'vitest'
import { formatBytes, formatRemaining, formatTime } from '~~/shared/utils/time'

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
