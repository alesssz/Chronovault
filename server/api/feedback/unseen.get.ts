import { getUnseenFeedback } from '../../services/feedback.service'

/**
 * GET /api/feedback/unseen — votes and comments on the user's groups of
 * versions that came after their last visit to each group: in total (the
 * dot on "Versions") and per group (the badges on the cards).
 * Auth: signed-in user (401 otherwise); only the user's own groups count.
 * 200 → UnseenFeedback
 */
export default defineEventHandler(async (event) => {
  // The signed-in user, and a database client acting as them (RLS applies); 401 without a session.
  const { db, userId } = await requireAuth(event)
  return getUnseenFeedback(db, userId)
})
