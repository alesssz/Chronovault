/**
 * The move of this browser's saved data from the keys of the app's former name (`chronoplayer:`)
 * to the current ones (`chronovault:`, app/lib/storage-keys.ts): every old key moved and removed,
 * a value already under the new name kept, other sites' keys untouched, a second run harmless.
 */
import { describe, expect, it } from 'vitest'
import { LEGACY_PREFIX, migrateLegacyKeys, STORAGE_KEYS } from '~/lib/storage-keys'

/** An in-memory Storage, with the indexes migrateLegacyKeys walks (`length`, `key`). */
function memoryStorage(initial: Record<string, string> = {}): Storage & { items: Map<string, string> } {
  // The stored values, by key.
  const items = new Map(Object.entries(initial))
  return {
    items,
    // How many keys are stored.
    get length() {
      return items.size
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    clear: () => items.clear(),
  }
}

describe('migrateLegacyKeys', () => {
  it('moves every old key to its new name and removes the old one', () => {
    // A browser with three keys saved under the old names.
    const storage = memoryStorage({
      'chronoplayer:volume': '0.4',
      'chronoplayer:listener-id': 'a1b2c3d4-0000-4000-8000-000000000000',
      'chronoplayer:queue': '{"version":2}',
    })
    expect(migrateLegacyKeys(storage)).toBe(3)
    expect(Object.fromEntries(storage.items)).toEqual({
      [STORAGE_KEYS.volume]: '0.4',
      [STORAGE_KEYS.listenerId]: 'a1b2c3d4-0000-4000-8000-000000000000',
      [STORAGE_KEYS.queue]: '{"version":2}',
    })
  })

  it('keeps a value already saved under the new name (it is the newer one)', () => {
    // The same setting under both names: the new one was written after the rename.
    const storage = memoryStorage({ 'chronoplayer:volume': '0.4', [STORAGE_KEYS.volume]: '0.9' })
    migrateLegacyKeys(storage)
    expect(Object.fromEntries(storage.items)).toEqual({ [STORAGE_KEYS.volume]: '0.9' })
  })

  it('leaves every other key alone, and changes nothing the second time', () => {
    // Another site's key next to an old one of ours.
    const storage = memoryStorage({ 'nuxt-color-mode': 'dark', 'chronoplayer:lyrics-view': 'true' })
    migrateLegacyKeys(storage)
    expect(migrateLegacyKeys(storage)).toBe(0)
    expect(Object.fromEntries(storage.items)).toEqual({ 'nuxt-color-mode': 'dark', [STORAGE_KEYS.lyricsView]: 'true' })
  })

  it('names every key with the new prefix, none with the old one', () => {
    for (const key of Object.values(STORAGE_KEYS)) {
      expect(key.startsWith('chronovault:')).toBe(true)
      expect(key.startsWith(LEGACY_PREFIX)).toBe(false)
    }
  })
})
