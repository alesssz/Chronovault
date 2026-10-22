/**
 * Small shared helpers: labels (plurals, cut texts, "A · B" lines), case-insensitive
 * keys, blank values, clamping and moving an item inside an ordered list.
 */
import { describe, expect, it } from 'vitest'
import { foldCase, hasText, joinParts, pluralize, truncate } from '~~/shared/utils/text'
import { clamp } from '~~/shared/utils/numbers'
import { moveItem } from '~~/shared/utils/arrays'

describe('pluralize', () => {
  it.each([
    [0, 'track', '0 tracks'],
    [1, 'track', '1 track'],
    [12, 'track', '12 tracks'],
    [2, 'private track', '2 private tracks'],
  ])('%s %s → %s', (count, noun, expected) => {
    expect(pluralize(count, noun)).toBe(expected)
  })

  it('takes an irregular plural', () => {
    expect(pluralize(3, 'child', 'children')).toBe('3 children')
  })
})

describe('truncate', () => {
  it('leaves short texts alone', () => {
    expect(truncate('Night drive', 20)).toBe('Night drive')
  })

  it('cuts long texts to the limit, ending with an ellipsis and no dangling space', () => {
    const cut = truncate('Night drive across the city', 13)
    expect(cut).toBe('Night drive…')
    expect(cut.length).toBeLessThanOrEqual(13)
  })
})

describe('joinParts', () => {
  it('joins only the parts that are set', () => {
    expect(joinParts(['Album', null, 2026, undefined, '', 'Synthwave'])).toBe('Album · 2026 · Synthwave')
  })

  it('gives an empty string when nothing is set', () => {
    expect(joinParts([null, undefined, ''])).toBe('')
  })

  it('accepts another separator', () => {
    expect(joinParts(['A', 'B'], ' - ')).toBe('A - B')
  })
})

describe('foldCase', () => {
  it('ignores case and surrounding spaces', () => {
    expect(foldCase('  Synth Wave ')).toBe(foldCase('synth wave'))
  })
})

describe('hasText', () => {
  it.each([
    ['text', true],
    [0, true],
    [2026, true],
    ['', false],
    ['   ', false],
    [null, false],
    [undefined, false],
  ])('%s → %s', (value, expected) => {
    expect(hasText(value)).toBe(expected)
  })
})

describe('clamp', () => {
  it('keeps values inside the range', () => {
    expect(clamp(-1, 0, 1)).toBe(0)
    expect(clamp(0.4, 0, 1)).toBe(0.4)
    expect(clamp(7, 0, 1)).toBe(1)
  })

  it('works with an open upper bound', () => {
    expect(clamp(500, 0, Number.POSITIVE_INFINITY)).toBe(500)
  })
})

describe('moveItem', () => {
  it('moves an item forward and backward, shifting the others', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('never mutates the original list', () => {
    const list = ['a', 'b', 'c']
    const moved = moveItem(list, 0, 1)
    expect(list).toEqual(['a', 'b', 'c'])
    expect(moved).not.toBe(list)
  })

  it('returns an unchanged copy for positions out of range', () => {
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], -1, 0)).toEqual(['a', 'b'])
  })
})
