import { trackCreateSchema } from '~~/shared/schemas/track'
import { createTrack } from '../../services/tracks.service'

/**
 * POST /api/tracks — registers a track whose file the client has already
 * uploaded to the audio storage (direct upload, see README → "Uploading a track").
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * Body: trackCreateSchema. 201 → TrackDetail; 400 invalid body, wrong paths,
 * file missing or of a different size (the file is then deleted).
 */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  const input = await readValidated(event, trackCreateSchema)
  setResponseStatus(event, 201)
  return createTrack(db, useAudioStorage(), userId, input)
})
