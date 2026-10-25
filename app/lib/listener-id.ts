/**
 * This browser's listener id: a random UUID kept in localStorage, sent with
 * plays (so a visitor counts once a day per track) and votes (so a visitor
 * has one pick per group, and can change it).
 *
 * It identifies nothing but this browser: no account, no personal data, and
 * it never leaves this app. Clearing the site's data makes a new one (a
 * visitor then counts as a new listener, and could vote again: acceptable
 * among friends). For the owner the server ignores it and uses the session.
 */
import { STORAGE_KEYS } from '~/lib/storage-keys'

/** localStorage key of the id (an id saved under the former name is moved there: see storage-keys.ts). */
const KEY = STORAGE_KEYS.listenerId
/** The shape of a UUID, to drop a corrupted stored value. */
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

/** Kept for this page's life when storage is missing or blocked (private mode): plays still count, once per visit. */
let fallback: string | null = null

/** This browser's id, created on first use. */
export function getListenerId(): string {
  try {
    // The browser's storage (absent on the server and in some tests).
    const storage = globalThis.localStorage
    if (storage) {
      // The id saved by an earlier visit, if any.
      const stored = storage.getItem(KEY)
      if (stored && UUID.test(stored)) return stored
      // A new random id, saved for the next visits.
      const id = crypto.randomUUID()
      storage.setItem(KEY, id)
      return id
    }
  }
  catch {
    // Storage blocked (or full): the per-page id below.
  }
  fallback ??= crypto.randomUUID()
  return fallback
}
