/**
 * Every key the app keeps in this browser's localStorage, in one place, and
 * the move from the keys of the app's former name.
 *
 * The keys share the `chronovault:` prefix. Keys written under the former
 * name start with `chronoplayer:`; migrateLegacyKeys moves them to the
 * current names (app/plugins/00.storage-keys.client.ts), so nothing a
 * visitor saved is lost: the volume, shuffle and repeat, the play queue, the
 * lyrics view and, above all, the listener id (a new id would count a
 * visitor's plays again and lose their vote on a group of versions).
 */

/** The prefix of every key. */
const PREFIX = 'chronovault:'

/** The prefix of the keys of the app's former name, moved by migrateLegacyKeys. */
export const LEGACY_PREFIX = 'chronoplayer:'

/** The keys, by what they hold. */
export const STORAGE_KEYS = {
  /** The player's volume (app/lib/player/settings.ts). */
  volume: `${PREFIX}volume`,
  /** Shuffle and repeat (app/lib/player/settings.ts). */
  playbackModes: `${PREFIX}playback-modes`,
  /** The saved play queue (app/lib/queue-storage.ts). */
  queue: `${PREFIX}queue`,
  /** The phones' lyrics view, on or off (PlayerExpanded). */
  lyricsView: `${PREFIX}lyrics-view`,
  /** This browser's listener id, for plays and votes (app/lib/listener-id.ts). */
  listenerId: `${PREFIX}listener-id`,
} as const

/**
 * Moves every `chronoplayer:` key to its `chronovault:` name and removes the
 * old one. A value already under the new name wins (it is newer: written
 * since the rename), so running this again changes nothing.
 * Returns how many old keys were found.
 */
export function migrateLegacyKeys(storage: Storage): number {
  // The old keys, collected first: removing while walking the indexes would skip some.
  const legacy: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key?.startsWith(LEGACY_PREFIX)) legacy.push(key)
  }
  for (const key of legacy) {
    const renamed = PREFIX + key.slice(LEGACY_PREFIX.length)
    const value = storage.getItem(key)
    if (value !== null && storage.getItem(renamed) === null) storage.setItem(renamed, value)
    storage.removeItem(key)
  }
  return legacy.length
}
