import { trackCreateSchema } from '~~/shared/schemas/track'
import { createTrack } from '../../services/tracks.service'

/**
 * POST /api/tracks — registers a track whose file the client has already
 * uploaded to storage (direct upload, see README → "Uploading a track").
 */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  const input = await readValidated(event, trackCreateSchema)
  setResponseStatus(event, 201)
  return createTrack(db, userId, input)
})
