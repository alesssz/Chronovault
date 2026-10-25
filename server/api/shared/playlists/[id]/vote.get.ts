import { voterQuerySchema } from '~~/shared/schemas/feedback'
import { getVoteState } from '../../../../services/feedback.service'

/**
 * GET /api/shared/playlists/:id/vote?voter=<browser id> — the vote state of
 * a shared group of versions for this visitor: voting open or closed,
 * whether the signed-in viewer owns the group, and this browser's own pick.
 * Nobody else's pick is ever returned.
 * Auth: none (public).
 * 200 → VersionVoteState · 400 invalid id or voter · 404 not a shared group
 */
export default defineEventHandler(async (event) => {
  // The query string, validated against the schema (400 otherwise).
  const { voter } = readValidatedQuery(event, voterQuerySchema)
  return getVoteState(await visitorClient(event), requireUuidParam(event), voter)
})
