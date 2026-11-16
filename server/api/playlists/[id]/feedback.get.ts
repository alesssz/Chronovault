import { getVersionFeedback } from '../../../services/feedback.service'

/**
 * GET /api/playlists/:id/feedback — the feedback on one of the user's
 * groups of versions: votes and visitors' plays per version (through the
 * group's link), different listeners, and the picks left with a name or a
 * comment. Voting is open until a version is marked final.
 * Auth: signed-in user (401 otherwise); only the user's own groups are reachable.
 * 200 → VersionFeedback · 404 missing, not the user's, or not a group of versions
 */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  return getVersionFeedback(db, userId, requireUuidParam(event))
})
