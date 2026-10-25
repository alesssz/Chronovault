/**
 * Byte helpers of the binary file code (WAV parser, FLAC encoder, tag writers, downloads).
 */
import { describe, expect, it } from 'vitest'
import { asciiAt, concatBytes } from '~/lib/bytes'

describe('concatBytes', () => {
  it('joins the parts in order into one buffer of their total length', () => {
    // Three parts, one of them empty, joined.
    const joined = concatBytes([new Uint8Array([1, 2]), new Uint8Array([]), new Uint8Array([3])])
    expect([...joined]).toEqual([1, 2, 3])
  })

  it('respects views into a larger buffer (only their own bytes)', () => {
    // A buffer the views below take a part of.
    const big = new Uint8Array([9, 9, 4, 5, 9])
    expect([...concatBytes([big.subarray(2, 4)])]).toEqual([4, 5])
  })

  it('gives an empty buffer for no parts', () => {
    expect(concatBytes([]).byteLength).toBe(0)
  })
})

describe('asciiAt', () => {
  // "RIFF" <size> "WAVE": the start of every WAV file.
  const header = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])

  it('reads 4-character ids at any offset', () => {
    expect(asciiAt(header, 0)).toBe('RIFF')
    expect(asciiAt(header, 8)).toBe('WAVE')
  })

  it('reads another length when asked', () => {
    expect(asciiAt(header, 1, 2)).toBe('IF')
  })
})
