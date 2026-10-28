/**
 * The clean-up's minimum age as configured (server/utils/storage-cleanup.ts):
 * a number, or the environment variable's text as Nitro hands it over, and
 * the 24-hour default for anything that holds no number. A blank variable
 * must never make every orphan deletable at once.
 */
import { describe, expect, it } from 'vitest'
import { parseMinAgeHours } from '~~/server/utils/storage-cleanup'

describe('parseMinAgeHours', () => {
  it('takes a number, or text holding one (0 included: the e2e tests delete at once)', () => {
    expect(parseMinAgeHours(24)).toBe(24)
    expect(parseMinAgeHours(0)).toBe(0)
    expect(parseMinAgeHours('48')).toBe(48)
    expect(parseMinAgeHours(' 1.5 ')).toBe(1.5)
  })

  it('falls back to 24 hours for a blank variable and other values that hold no number', () => {
    // What `destr` makes of '', ' ', 'null', 'true' and 'false', and a missing setting.
    // Before: '', ' ', null and false became 0 (delete at once), true became 1.
    for (const raw of ['', ' ', null, true, false, undefined, 'soon']) {
      expect(parseMinAgeHours(raw), String(raw)).toBe(24)
    }
  })

  it('falls back to 24 hours for a negative or infinite number', () => {
    expect(parseMinAgeHours(-1)).toBe(24)
    expect(parseMinAgeHours('-5')).toBe(24)
    expect(parseMinAgeHours(Number.POSITIVE_INFINITY)).toBe(24)
  })
})
