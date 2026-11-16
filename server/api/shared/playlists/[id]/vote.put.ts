import { versionVoteSchema } from '~~/shared/schemas/feedback'
import { castVote } from '../../../../services/feedback.service'

/**
 * PUT /api/shared/playlists/:id/vote — the visitor picks the version they
 * prefer in a shared group, with an optional name and comment for the
 * owner. One pick per browser and group: voting again replaces it.
 * Body: versionVoteSchema ({ voterId, trackId, name?, comment? }).
 * Auth: none (public); the group's owner cannot vote.
 * 200 → VersionVoteState · 400 invalid body · 403 the owner · 404 not a
 * shared group, or not one of its versions · 409 voting closed (a version is final)
 */
export default defineEventHandler(async (event) => {
  const id = requireUuidParam(event)
  const vote = await readValidated(event, versionVoteSchema)
  return castVote(await visitorClient(event), id, vote)
})
