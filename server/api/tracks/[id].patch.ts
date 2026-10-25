import { trackUpdateSchema } from '~~/shared/schemas/track'
import { updateTrack } from '../../services/tracks.service'

/**
 * PATCH /api/tracks/:id — updates one or more metadata fields, or the cover
 * (`coverPath: null` removes it and deletes the file).
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * Body: trackUpdateSchema (any non-empty subset). 200 → TrackDetail; 400; 404.
 */
export default defineEventHandler(async (event) => {
  // The signed-in user, and a database client acting as them (RLS applies); 401 without a session.
  const { db, userId } = await requireAuth(event)
  // The id in the address (400 when it is not a UUID).
  const id = requireUuidParam(event)
  // The request body, validated against the schema (400 otherwise).
  const input = await readValidated(event, trackUpdateSchema)
  return updateTrack(db, userId, id, input)
})
