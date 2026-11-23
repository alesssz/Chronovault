/**
 * Where a title is cut on narrow lines (app/lib/track-title.ts): its end,
 * where versions differ, stays whole.
 */
import { describe, expect, it } from 'vitest'
import { splitTitleEnd } from '~/lib/track-title'

describe('splitTitleEnd', () => {
  it('keeps the last word as the end', () => {
    expect(splitTitleEnd('The Silver Mask of Hierusalem 2')).toEqual({ head: 'The Silver Mask of Hierusalem', end: '2' })
    expect(splitTitleEnd('Night drive v1')).toEqual({ head: 'Night drive', end: 'v1' })
  })

  it('keeps a closing bracketed group whole', () => {
    expect(splitTitleEnd('The Marble and the Flames (Cover)')).toEqual({ head: 'The Marble and the Flames', end: '(Cover)' })
    expect(splitTitleEnd('Rain (Live at Abbey Road)')).toEqual({ head: 'Rain', end: '(Live at Abbey Road)' })
    expect(splitTitleEnd('Rain [demo 2]')).toEqual({ head: 'Rain', end: '[demo 2]' })
  })

  it('keeps only the last word of a long bracketed aside', () => {
    expect(splitTitleEnd('Rain (recorded at home on a rainy afternoon)')).toEqual({ head: 'Rain (recorded at home on a rainy', end: 'afternoon)' })
  })

  it('gives a single word no head, and ignores the outer spaces', () => {
    expect(splitTitleEnd('  Rain  ')).toEqual({ head: '', end: 'Rain' })
    expect(splitTitleEnd('')).toEqual({ head: '', end: '' })
  })
})
