import { playRecordSchema } from '~~/shared/schemas/feedback'
import { recordPlay } from '../services/feedback.service'

/**
 * POST /api/plays — counts a play: the player sends it once a track has
 * really been listened to (30 s, or half of a shorter track), and again
 * with `completed: true` at 90%. A listener counts once per track, context
 * and day; sending it again only marks the play completed.
 * Body: playRecordSchema ({ trackId, playlistId?, listenerId, completed? }).
 * Auth: none (share pages have anonymous visitors). With a session, the
 * owner's own plays are recognised and kept apart; a visitor can only
 * count a track they can listen to there (404 otherwise, like a missing one).
 * 204 · 400 invalid body · 404
 */
export default defineEventHandler(async (event) => {
  const play = await readValidated(event, playRecordSchema)
  await recordPlay(await visitorClient(event), play)
  setResponseStatus(event, 204)
  return null
})
