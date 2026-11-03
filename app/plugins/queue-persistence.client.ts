import { clearSavedQueue, readSavedQueue, resolveSavedQueue, saveQueue } from '~/lib/queue-storage'
import { endStartupRead, readLibrary } from '~/lib/library-request'

/**
 * Keeps the library play queue across reloads and visits on this device.
 *
 * - Saving: whenever the queue, the current track, the status or the
 *   shuffle order changes, every 5 seconds of playback, and when the page
 *   is hidden or closed. A queue shuffled at some point keeps its original order too.
 * - Restoring: once per signed-in user, when the app opens on a library page;
 *   the queue comes back paused, at the saved position.
 * - Forgetting: closing the player (×) or signing out clears the saved queue.
 *
 * Only library playback is saved: public share pages have their own player
 * and never touch the saved queue (not even from another tab).
 */
export default defineNuxtPlugin((nuxtApp) => {
  // The queue to save and restore.
  const player = usePlayerStore()
  // The saved queue belongs to this user.
  const user = useSupabaseUser()
  // Navigation triggers a restore when the app opened on a page without one.
  const router = useRouter()

  /** Pages where nothing is restored: public share pages and the sign-in flow. */
  const NO_RESTORE = /^\/(?:t|p|login|confirm)(?:\/|$)/
  /** While restoring, the intermediate states must not overwrite the saved queue. */
  let restoring = false
  /** This tab saved a queue: only then may it clear it (a public page in another tab must not). */
  let ownsSavedQueue = false
  /** User whose queue was already restored (or tried) in this tab: restore at most once per user. */
  let restoredFor: string | null = null

  /**
   * Saves the current library queue, or forgets it once the player is
   * closed. Skipped while a restore is running.
   */
  function persist() {
    // Whose queue it is (the signed-in user's id).
    const userId = user.value?.sub
    // Signed out, or a restore is writing its own state: nothing to save now.
    if (!userId || restoring) return
    if (player.status === 'idle') {
      if (ownsSavedQueue) clearSavedQueue()
      ownsSavedQueue = false
      return
    }
    if (!player.queueEditable || player.index < 0) return
    // Ids only, the current track and the position (see queue-storage.ts).
    saveQueue({
      userId,
      trackIds: player.queue.map(t => t.id),
      index: player.index,
      position: player.currentTime,
      // Once shuffled: the list's original order (to unshuffle, and for new rounds of repeat all).
      originalTrackIds: player.originalOrder ?? undefined,
      // The page it was started from (a playlist's), so that page knows it again after a reload.
      from: player.queueFrom ?? undefined,
    })
    ownsSavedQueue = true
  }

  /**
   * Restores once per user, on the first library page: opening the app on
   * /login (expired session) restores right after signing in instead.
   */
  function maybeRestore(path: string) {
    // Nothing to restore for a signed-out visitor.
    const userId = user.value?.sub
    if (!userId || restoredFor === userId || NO_RESTORE.test(path)) return
    restoredFor = userId
    void restore(userId)
  }

  /** Reads the saved queue, matches it with the current library and loads it paused. */
  async function restore(userId: string) {
    // This user's saved queue, if any.
    const saved = readSavedQueue(userId)
    if (!saved) return
    restoring = true
    try {
      // Current library: drops deleted tracks, brings current cover addresses (the library page's own read when it is asking too).
      const library = await readLibrary()
      // The user may have started something while the library loaded.
      if (player.isActive) return
      // The saved ids matched with the library (deleted tracks dropped).
      const resolved = resolveSavedQueue(saved, library)
      if (!resolved || !(await player.restoreQueue(resolved.items, resolved.index, resolved.position, resolved.originalIds, saved.from))) {
        clearSavedQueue()
        return
      }
      ownsSavedQueue = true
    }
    catch {
      // Offline or session expired: keep the saved queue for next time.
    }
    finally {
      restoring = false
    }
    persist()
  }

  // The library read made while the app opens is shared with the page until that page is on
  // screen, even once answered (see library-request.ts): the restore's read and the page's are one.
  nuxtApp.hooks.hookOnce('page:finish', endStartupRead)

  // Restore as soon as the user is known (app start, sign-in), and after navigations.
  watch(() => user.value?.sub, () => maybeRestore(window.location.pathname), { immediate: true })
  router.afterEach(to => maybeRestore(to.path))

  // Save on every change of the queue, the current track, the status, the shuffle order or the queue's page.
  watch([() => player.queue, () => player.index, () => player.status, () => player.originalOrder, () => player.queueFrom], persist)
  // Position: every 5 seconds is enough to resume close to where the user was.
  watch(() => Math.floor(player.currentTime / 5), persist)
  // Exact position when leaving: tab hidden, page closed or reloaded.
  useEventListener(window, 'pagehide', persist)
  // Tab hidden (another app, the phone locked): save the exact position too.
  useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist()
  })
})
