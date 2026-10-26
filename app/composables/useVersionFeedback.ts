import type { VersionFeedback, VersionTally } from '~~/shared/types/playlist'
import { playlistsApi } from '~/services/api'

/**
 * The friends' feedback on a group of versions, for its owner's page
 * (PlaylistEditor): votes, visitors' plays and notes, loaded once the page
 * is on screen and again on demand (a version removed, marked final or
 * draft), and the owner's visit recorded so that it stops being new.
 *
 * New feedback is seen when the owner leaves the group. Opening it drops
 * its badge and its share of the header's dot at once; the server learns of
 * the visit only when the owner leaves (page closed, hidden or left for
 * another one), so the comments that were new keep their "New" mark for the
 * whole visit, even when the feedback reloads. The visit covers what was on
 * screen: the group is seen up to when its feedback was last read (`asOf`),
 * so a vote that arrived while the owner looked at an older copy stays new.
 *
 * `enabled` false (a curated playlist: no votes) makes it inert: no request,
 * no visit, `feedback` stays null. Call it from a component's setup.
 */
export function useVersionFeedback(playlistId: string, enabled: boolean) {
  /** Votes, visitors' plays and notes of the group; null for a playlist, or until loaded. */
  const feedback = ref<VersionFeedback | null>(null)

  /** (Re)loads the feedback; a failure just leaves the panel out. */
  async function load() {
    if (!enabled) return
    try {
      feedback.value = await playlistsApi.feedback(playlistId)
    }
    catch {
      feedback.value = null
    }
  }

  /** A version's votes and plays, for the line under its title (null: no feedback loaded). */
  function tallyOf(trackId: string): VersionTally | null {
    return feedback.value?.versions.find(v => v.trackId === trackId) ?? null
  }

  // The feedback, once the page is on screen.
  onMounted(load)

  // The unseen-feedback counts of the header's dot and the cards' badges (groups only).
  const unseen = enabled ? useUnseenFeedback() : null
  // The dot and the card's badge go away at once, before the visit is recorded.
  onMounted(() => unseen?.clearLocally(playlistId))
  /** Records the visit (idempotent: hiding the page and then leaving it sends it twice, harmlessly). */
  function markSeen() {
    // No feedback on screen (not loaded, or failed): nothing was seen.
    if (feedback.value) void unseen?.markSeen(playlistId, feedback.value.asOf)
  }
  // Leaving the page in the app records the visit.
  onBeforeUnmount(markSeen)
  // Hidden (another tab or app, the phone locked) or closed: the visit counts as done.
  useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden') markSeen()
  })
  // Closing the tab or leaving the site records it too.
  useEventListener(window, 'pagehide', markSeen)

  return { feedback, load, tallyOf }
}
