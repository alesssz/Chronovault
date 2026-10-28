/**
 * Saved play queue (app/lib/queue-storage.ts): saving and reading back
 * (the page the queue was started from included), discarding malformed data
 * or another user's queue, and rebuilding the queue when tracks were deleted
 * in the meantime.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearSavedQueue, readSavedQueue, resolveSavedQueue, saveQueue } from '~/lib/queue-storage'

/** The localStorage key the module uses. */
const KEY = 'chronovault:queue'

/** In-memory localStorage (the unit tests run in Node). */
function memoryStorage(): Storage {
  // The stored values.
  const data = new Map<string, string>()
  return {
    // How many keys are stored.
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: key => data.get(key) ?? null,
    key: i => [...data.keys()][i] ?? null,
    removeItem: (key) => {
      data.delete(key)
    },
    setItem: (key, value) => {
      data.set(key, String(value))
    },
  }
}

beforeEach(() => {
  globalThis.localStorage = memoryStorage()
})

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage
})

describe('saving and reading', () => {
  it('reads back what was saved, for the same user', () => {
    saveQueue({ userId: 'u1', trackIds: ['a', 'b', 'c'], index: 1, position: 42.345 })
    expect(readSavedQueue('u1')).toMatchObject({ version: 2, userId: 'u1', trackIds: ['a', 'b', 'c'], index: 1, position: 42.3 })
  })

  it('never hands one user\'s queue to another, and forgets it', () => {
    saveQueue({ userId: 'u1', trackIds: ['a'], index: 0, position: 0 })
    expect(readSavedQueue('u2')).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it.each([
    ['not JSON', '{oops'],
    ['an old format', JSON.stringify({ version: 0, userId: 'u1', trackIds: ['a'], index: 0, position: 0 })],
    ['an index out of range', JSON.stringify({ version: 1, userId: 'u1', trackIds: ['a'], index: 3, position: 0 })],
    ['a bad position', JSON.stringify({ version: 1, userId: 'u1', trackIds: ['a'], index: 0, position: 'x' })],
    ['a bad original order', JSON.stringify({ version: 2, userId: 'u1', trackIds: ['a'], index: 0, position: 0, originalTrackIds: [1] })],
    ['a bad page of origin', JSON.stringify({ version: 2, userId: 'u1', trackIds: ['a'], index: 0, position: 0, from: 7 })],
  ])('discards %s', (_label, raw) => {
    localStorage.setItem(KEY, raw)
    expect(readSavedQueue('u1')).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('saves the page a queue was started from, and reads a queue saved without one', () => {
    saveQueue({ userId: 'u1', trackIds: ['a', 'b'], index: 0, position: 0, from: 'playlist:p1' })
    expect(readSavedQueue('u1')?.from).toBe('playlist:p1')
    // Saved before the field existed (or from the library): no page, still a valid queue.
    saveQueue({ userId: 'u1', trackIds: ['a', 'b'], index: 0, position: 0 })
    expect(readSavedQueue('u1')?.from).toBeUndefined()
  })

  it('saves the original order of a shuffled queue', () => {
    saveQueue({ userId: 'u1', trackIds: ['c', 'a', 'b'], index: 0, position: 0, originalTrackIds: ['a', 'b', 'c'] })
    expect(readSavedQueue('u1')?.originalTrackIds).toEqual(['a', 'b', 'c'])
  })

  it('still reads a queue saved in format 1 (no shuffle)', () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, userId: 'u1', trackIds: ['a', 'b'], index: 1, position: 3 }))
    // A version-1 queue, written before shuffle existed, read back.
    const saved = readSavedQueue('u1')
    expect(saved).toMatchObject({ trackIds: ['a', 'b'], index: 1, position: 3 })
    expect(saved?.originalTrackIds).toBeUndefined()
  })

  it('clears the saved queue', () => {
    saveQueue({ userId: 'u1', trackIds: ['a'], index: 0, position: 0 })
    clearSavedQueue()
    expect(readSavedQueue('u1')).toBeNull()
  })

  it('works without any storage (e.g. blocked by the browser)', () => {
    delete (globalThis as { localStorage?: Storage }).localStorage
    expect(() => saveQueue({ userId: 'u1', trackIds: ['a'], index: 0, position: 0 })).not.toThrow()
    expect(readSavedQueue('u1')).toBeNull()
  })
})

describe('resolveSavedQueue', () => {
  /** Minimal library items: only ids matter here. */
  const tracks = (...ids: string[]) => ids.map(id => ({ id }))

  it('drops deleted tracks from the original order too', () => {
    // A saved shuffled queue whose original order holds a deleted track.
    const resolved = resolveSavedQueue({ trackIds: ['b', 'a'], index: 0, position: 0, originalTrackIds: ['a', 'x', 'b'] }, tracks('a', 'b'))
    expect(resolved?.originalIds).toEqual(['a', 'b'])
  })

  it('has no original order for a queue saved without shuffle', () => {
    expect(resolveSavedQueue({ trackIds: ['a'], index: 0, position: 0 }, tracks('a'))?.originalIds).toBeUndefined()
  })

  it('resumes the same track at the same position', () => {
    expect(resolveSavedQueue({ trackIds: ['a', 'b', 'c'], index: 1, position: 30 }, tracks('a', 'b', 'c')))
      .toEqual({ items: tracks('a', 'b', 'c'), index: 1, position: 30 })
  })

  it('drops deleted tracks and keeps pointing at the current one', () => {
    expect(resolveSavedQueue({ trackIds: ['a', 'b', 'c'], index: 2, position: 30 }, tracks('c', 'b')))
      .toEqual({ items: tracks('b', 'c'), index: 1, position: 30 })
  })

  it('moves to the next surviving track, from the start, when the current one was deleted', () => {
    expect(resolveSavedQueue({ trackIds: ['a', 'b', 'c'], index: 1, position: 30 }, tracks('a', 'c')))
      .toEqual({ items: tracks('a', 'c'), index: 1, position: 0 })
  })

  it('falls back to the previous track when nothing comes after', () => {
    expect(resolveSavedQueue({ trackIds: ['a', 'b'], index: 1, position: 30 }, tracks('a')))
      .toEqual({ items: tracks('a'), index: 0, position: 0 })
  })

  it('gives up when no track survives', () => {
    expect(resolveSavedQueue({ trackIds: ['a'], index: 0, position: 3 }, tracks('z'))).toBeNull()
  })
})
