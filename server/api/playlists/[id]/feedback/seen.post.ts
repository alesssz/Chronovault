import { feedbackSeenSchema } from '~~/shared/schemas/feedback'
import { markFeedbackSeen } from '../../../../services/feedback.service'

/**
 * POST /api/playlists/:id/feedback/seen — records the owner's visit to a
 * group of versions (the page sends it when the owner leaves it): its
 * feedback up to `at` (the `asOf` of the copy on screen; now when left out)
 * stops counting as new. Never beyond now, never back before a later visit
 * already recorded.
 * Body: feedbackSeenSchema ({ at? }), or none.
 * Auth: signed-in user (401 otherwise); only the user's own groups are reachable.
 * 204 · 400 invalid `at` · 404 missing or not the user's
 */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  const id = requireUuidParam(event)
  const { at } = await readValidated(event, feedbackSeenSchema)
  await markFeedbackSeen(db, userId, id, at)
  setResponseStatus(event, 204)
  return null
})
