import { trackUpdateSchema } from '~~/shared/schemas/track'
import { updateTrack } from '../../services/tracks.service'

/**
 * PATCH /api/tracks/:id — updates one or more metadata fields, or the cover
 * (`coverPath: null` removes it and deletes the file).
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * Body: trackUpdateSchema (any non-empty subset). 200 → TrackDetail; 400; 404.
 */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  const id = requireUuidParam(event)
  const input = await readValidated(event, trackUpdateSchema)
  return updateTrack(db, userId, id, input)
})
