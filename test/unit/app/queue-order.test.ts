/**
 * Play-order rules of shuffle (app/lib/queue-order.ts), with a seeded random
 * source so every shuffle is reproducible.
 */
import { describe, expect, it } from 'vitest'
import { randomUpcomingSlot, shuffled, shuffledRound, shuffleUpcoming, unshuffleUpcoming } from '~/lib/queue-order'

/** Deterministic random numbers in [0, 1) (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Queue items with the given ids. */
const items = (...ids: string[]) => ids.map(id => ({ id }))
/** The ids of queue items, in order. */
const ids = (queue: { id: string }[]) => queue.map(t => t.id)

describe('shuffled', () => {
  it('returns a permutation and leaves the input untouched', () => {
    const input = ['a', 'b', 'c', 'd', 'e']
    const result = shuffled(input, seeded(1))
    expect([...result].sort()).toEqual(input)
    expect(result).not.toEqual(input)
    expect(input).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('uses the random source (same seed, same order)', () => {
    expect(shuffled(['a', 'b', 'c', 'd'], seeded(7))).toEqual(shuffled(['a', 'b', 'c', 'd'], seeded(7)))
  })
})

describe('shuffleUpcoming', () => {
  it('keeps played tracks and the current one in place', () => {
    const result = ids(shuffleUpcoming(items('a', 'b', 'c', 'd', 'e', 'f'), 1, seeded(3)))
    expect(result.slice(0, 2)).toEqual(['a', 'b'])
    expect(result.slice(2).sort()).toEqual(['c', 'd', 'e', 'f'])
  })
})

describe('unshuffleUpcoming', () => {
  const original = ['a', 'b', 'c', 'd', 'e']

  it('carries on in the original order from the current track, wrapping around', () => {
    // Current: c (played: e). Upcoming, shuffled: a, d, b.
    expect(ids(unshuffleUpcoming(items('e', 'c', 'a', 'd', 'b'), 1, original))).toEqual(['e', 'c', 'd', 'a', 'b'])
  })

  it('puts tracks the original order does not know last, in their current order', () => {
    expect(ids(unshuffleUpcoming(items('a', 'x', 'c', 'y', 'b'), 0, original))).toEqual(['a', 'b', 'c', 'x', 'y'])
  })
})

describe('randomUpcomingSlot', () => {
  it('lands after the current track, the end included', () => {
    expect(randomUpcomingSlot(5, 1, () => 0)).toBe(2)
    expect(randomUpcomingSlot(5, 1, () => 0.999)).toBe(5)
    expect(randomUpcomingSlot(1, 0, () => 0.5)).toBe(1)
  })
})

describe('shuffledRound', () => {
  it('never starts with the track that just ended', () => {
    for (let seed = 0; seed < 50; seed++) {
      const round = ids(shuffledRound(items('a', 'b', 'c'), 'a', seeded(seed)))
      expect(round[0]).not.toBe('a')
      expect([...round].sort()).toEqual(['a', 'b', 'c'])
    }
  })

  it('a single track is simply played again', () => {
    expect(ids(shuffledRound(items('a'), 'a'))).toEqual(['a'])
  })
})
