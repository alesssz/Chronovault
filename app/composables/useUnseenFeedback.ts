import type { UnseenFeedback } from '~~/shared/types/playlist'
import { playlistsApi } from '~/services/api'

/**
 * "Seen" requests on their way (see refresh()). Module-level: every caller
 * shares them, like the cached counts. Browser only in practice (the app's
 * pages are client-rendered).
 */
const pendingMarks = new Set<Promise<void>>()

/**
 * Feedback on the user's groups of versions that came after their last
 * visit to each group (votes, comments included): the dot on "Versions" in
 * the header and the "new" badges on the Versions page's cards.
 *
 * One cache entry shared by every caller. The header refreshes it whenever
 * the app comes back to the screen (a friend may have voted meanwhile), the
 * Versions page when it opens.
 *
 * A group's page clears its badge here as soon as it opens (the owner is
 * looking at it) but tells the server only when the owner leaves it
 * (`markSeen`), so the comments that were new keep their "New" mark for the
 * whole visit, even when the feedback reloads.
 */
export function useUnseenFeedback() {
  // Nothing unseen until the first answer (and when it fails: no dot rather than an error).
  const { data, refresh: fetchCounts } = useAsyncData('unseen-feedback', () => playlistsApi.unseenFeedback(), {
    default: (): UnseenFeedback => ({ total: 0, groups: {} }),
  })

  /**
   * Asks the server again, once every "seen" still on its way has arrived:
   * leaving a group for the Versions page sends the one and asks for the
   * other at the same moment, and an answer computed before the visit was
   * recorded would bring the group's badge back.
   */
  async function refresh(): Promise<void> {
    await Promise.allSettled([...pendingMarks])
    await fetchCounts()
  }

  /** Unseen votes of one group (0 when none). */
  function countFor(id: string): number {
    return data.value.groups[id] ?? 0
  }

  /** The owner opened the group: its badge and its share of the dot go at once, here only. */
  function clearLocally(id: string): void {
    const count = data.value.groups[id]
    if (!count) return
    const { [id]: _cleared, ...rest } = data.value.groups
    data.value = { total: data.value.total - count, groups: rest }
  }

  /**
   * The owner left the group's page: its feedback up to `at` (the `asOf` of
   * the copy they saw) is seen, on every device. Best effort (sent with
   * `keepalive`, so it survives the page closing); a lost request only means
   * the badge shows once more.
   */
  async function markSeen(id: string, at: string): Promise<void> {
    clearLocally(id)
    const request = playlistsApi.markFeedbackSeen(id, at).then(() => {}, () => {
      // Offline or the page went away too fast: next time.
    })
    pendingMarks.add(request)
    try {
      await request
    }
    finally {
      pendingMarks.delete(request)
    }
  }

  return { unseen: data, refresh, countFor, clearLocally, markSeen }
}
