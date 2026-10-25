/**
 * This browser's listener id (app/lib/listener-id.ts): created once and kept, a corrupted value
 * replaced, and one stable id per page when storage is missing or blocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** A UUID, as crypto.randomUUID() makes them. */
const UUID = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/

/** A fresh copy of the module (its per-page fallback id starts empty). */
async function load() {
  vi.resetModules()
  return import('~/lib/listener-id')
}

/** In-memory localStorage. */
function fakeStorage(initial: Record<string, string> = {}) {
  // The stored values, by key.
  const items = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    items,
  }
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getListenerId', () => {
  it('creates an id once and keeps it in storage', async () => {
    // An empty storage.
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    // A fresh copy of the module, and the id it makes.
    const { getListenerId } = await load()
    const id = getListenerId()
    expect(id).toMatch(UUID)
    expect(getListenerId()).toBe(id)
    expect(storage.items.get('chronovault:listener-id')).toBe(id)
  })

  it('reuses the id of a previous visit', async () => {
    // An id saved by an earlier visit.
    const saved = '11111111-1111-4111-8111-111111111111'
    vi.stubGlobal('localStorage', fakeStorage({ 'chronovault:listener-id': saved }))
    // A fresh copy of the module.
    const { getListenerId } = await load()
    expect(getListenerId()).toBe(saved)
  })

  it('replaces a corrupted value', async () => {
    // A storage holding something that is not an id.
    const storage = fakeStorage({ 'chronovault:listener-id': 'not an id' })
    vi.stubGlobal('localStorage', storage)
    // A fresh copy of the module.
    const { getListenerId } = await load()
    expect(getListenerId()).toMatch(UUID)
    expect(storage.items.get('chronovault:listener-id')).toMatch(UUID)
  })

  it('keeps one id for the page when storage is missing', async () => {
    vi.stubGlobal('localStorage', undefined)
    // A fresh copy of the module, and the id it makes without storage.
    const { getListenerId } = await load()
    const id = getListenerId()
    expect(id).toMatch(UUID)
    expect(getListenerId()).toBe(id)
  })

  it('keeps one id for the page when storage is blocked', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
    // A fresh copy of the module, and the id it makes with storage blocked.
    const { getListenerId } = await load()
    const id = getListenerId()
    expect(id).toMatch(UUID)
    expect(getListenerId()).toBe(id)
  })
})
