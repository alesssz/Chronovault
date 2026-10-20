import { trackUpdateSchema } from '~~/shared/schemas/track'
import { updateTrack } from '../../services/tracks.service'

/** PATCH /api/tracks/:id — updates one or more metadata fields. */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  const id = requireUuidParam(event)
  const input = await readValidated(event, trackUpdateSchema)
  return updateTrack(db, userId, id, input)
})
