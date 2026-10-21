/**
 * The play queue saved in the browser (localStorage), so a reload or a new
 * visit on the same device resumes where the user left off: same queue,
 * same track, same position (paused).
 *
 * Only track ids are stored, never track data: on restore the ids are
 * matched against the user's current library, so deleted tracks drop out
 * and covers come with fresh signed URLs. The saved queue belongs to one
 * user: another account signing in on the same browser never sees it.
 */

const KEY = 'chronoplayer:queue'
/** Format version: an old or unknown format is discarded rather than misread. */
const VERSION = 1

/** What is stored under KEY (JSON). */
export interface SavedQueue {
  version: typeof VERSION
  /** Owner of the queue (`auth.users.id`). */
  userId: string
  /** The whole queue, in order: played, current, upcoming. */
  trackIds: string[]
  /** Position of the current track in `trackIds`. */
  index: number
  /** Playback position in the current track, in seconds. */
  position: number
  /** ISO timestamp of the last save (informational). */
  savedAt: string
}

/** Browser storage, or null when unavailable (server, private mode, blocked storage). */
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  }
  catch {
    return null
  }
}

/** Saves the queue state; failures (quota, blocked storage) are ignored: it is only a convenience. */
export function saveQueue(state: Pick<SavedQueue, 'userId' | 'trackIds' | 'index' | 'position'>): void {
  // Position rounded to a tenth of a second: plenty to resume, compact in storage.
  const saved: SavedQueue = {
    version: VERSION,
    ...state,
    position: Math.max(0, Math.round(state.position * 10) / 10),
    savedAt: new Date().toISOString(),
  }
  try {
    storage()?.setItem(KEY, JSON.stringify(saved))
  }
  catch {
    // Not saved: the next reload simply starts with an empty player.
  }
}

/** Forgets the saved queue (player closed, sign-out, unusable data). */
export function clearSavedQueue(): void {
  try {
    storage()?.removeItem(KEY)
  }
  catch {
    // Nothing to do.
  }
}

/**
 * The queue saved for `userId`, or null. Malformed data, an old format or
 * another user's queue are discarded.
 */
export function readSavedQueue(userId: string): SavedQueue | null {
  // Parsed JSON, validated field by field below (never trusted).
  let value: unknown
  try {
    const raw = storage()?.getItem(KEY)
    if (!raw) return null
    value = JSON.parse(raw)
  }
  catch {
    clearSavedQueue()
    return null
  }
  const saved = value as Partial<SavedQueue>
  const valid = saved?.version === VERSION
    && typeof saved.userId === 'string'
    && Array.isArray(saved.trackIds) && saved.trackIds.every(id => typeof id === 'string')
    && Number.isInteger(saved.index) && saved.index! >= 0 && saved.index! < saved.trackIds.length
    && typeof saved.position === 'number' && Number.isFinite(saved.position)
  if (!valid || saved.userId !== userId) {
    clearSavedQueue()
    return null
  }
  return saved as SavedQueue
}

/**
 * Rebuilds the queue from the saved ids and the tracks that still exist.
 * If the current track was deleted, playback resumes at the next surviving
 * track (or the previous one), from the start. Null when nothing survives.
 */
export function resolveSavedQueue<T extends { id: string }>(
  saved: Pick<SavedQueue, 'trackIds' | 'index' | 'position'>,
  available: readonly T[],
): { items: T[], index: number, position: number } | null {
  // Existing tracks by id, for O(1) lookups.
  const byId = new Map(available.map(t => [t.id, t]))
  const items = saved.trackIds.flatMap(id => byId.get(id) ?? [])
  if (items.length === 0) return null

  const currentId = saved.trackIds[saved.index]!
  if (byId.has(currentId)) {
    return { items, index: items.findIndex(t => t.id === currentId), position: saved.position }
  }
  // The current track is gone: the closest surviving neighbour, after first.
  const after = saved.trackIds.slice(saved.index + 1).find(id => byId.has(id))
  const before = saved.trackIds.slice(0, saved.index).reverse().find(id => byId.has(id))
  const fallback = after ?? before!
  return { items, index: items.findIndex(t => t.id === fallback), position: 0 }
}
