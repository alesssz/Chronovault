import { voterQuerySchema } from '~~/shared/schemas/feedback'
import { withdrawVote } from '../../../../services/feedback.service'

/**
 * DELETE /api/shared/playlists/:id/vote?voter=<browser id> — the visitor
 * takes their pick back (while voting is open).
 * Auth: none (public); the group's owner has no pick to withdraw.
 * 200 → VersionVoteState · 400 invalid id or voter · 403 the owner · 404 not
 * a shared group · 409 voting closed
 */
export default defineEventHandler(async (event) => {
  // The query string, validated against the schema (400 otherwise).
  const { voter } = readValidatedQuery(event, voterQuerySchema)
  return withdrawVote(await visitorClient(event), requireUuidParam(event), voter)
})
