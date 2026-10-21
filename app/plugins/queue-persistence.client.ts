import { clearSavedQueue, readSavedQueue, resolveSavedQueue, saveQueue } from '~/lib/queue-storage'
import { tracksApi } from '~/services/api'

/**
 * Keeps the library play queue across reloads and visits on this device.
 *
 * - Saving: whenever the queue, the current track or the status changes,
 *   every 5 seconds of playback, and when the page is hidden or closed.
 * - Restoring: once per signed-in user, when the app opens on a library page;
 *   the queue comes back paused, at the saved position.
 * - Forgetting: closing the player (×) or signing out clears the saved queue.
 *
 * Only library playback is saved: public share pages have their own player
 * and never touch the saved queue (not even from another tab).
 */
export default defineNuxtPlugin(() => {
  const player = usePlayerStore()
  const user = useSupabaseUser()
  const router = useRouter()

  /** Pages where nothing is restored: public share pages and the sign-in flow. */
  const NO_RESTORE = /^\/(?:t|p|login|confirm)(?:\/|$)/
  /** While restoring, the intermediate states must not overwrite the saved queue. */
  let restoring = false
  /** This tab saved a queue: only then may it clear it (a public page in another tab must not). */
  let ownsSavedQueue = false
  let restoredFor: string | null = null

  function persist() {
    const userId = user.value?.sub
    if (!userId || restoring) return
    if (player.status === 'idle') {
      if (ownsSavedQueue) clearSavedQueue()
      ownsSavedQueue = false
      return
    }
    if (!player.queueEditable || player.index < 0) return
    saveQueue({
      userId,
      trackIds: player.queue.map(t => t.id),
      index: player.index,
      position: player.currentTime,
    })
    ownsSavedQueue = true
  }

  /**
   * Restores once per user, on the first library page: opening the app on
   * /login (expired session) restores right after signing in instead.
   */
  function maybeRestore(path: string) {
    const userId = user.value?.sub
    if (!userId || restoredFor === userId || NO_RESTORE.test(path)) return
    restoredFor = userId
    void restore(userId)
  }

  async function restore(userId: string) {
    const saved = readSavedQueue(userId)
    if (!saved) return
    restoring = true
    try {
      // Current library: drops deleted tracks, brings fresh cover URLs.
      const library = await tracksApi.list()
      // The user may have started something while the library loaded.
      if (player.isActive) return
      const resolved = resolveSavedQueue(saved, library)
      if (!resolved || !(await player.restoreQueue(resolved.items, resolved.index, resolved.position))) {
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

  watch(() => user.value?.sub, () => maybeRestore(window.location.pathname), { immediate: true })
  router.afterEach(to => maybeRestore(to.path))

  watch([() => player.queue, () => player.index, () => player.status], persist)
  // Position: every 5 seconds is enough to resume close to where the user was.
  watch(() => Math.floor(player.currentTime / 5), persist)
  // Exact position when leaving: tab hidden, page closed or reloaded.
  useEventListener(window, 'pagehide', persist)
  useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist()
  })
})
