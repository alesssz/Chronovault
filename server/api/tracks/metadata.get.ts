import { listTrackMetadata } from '../../services/tracks.service'

/**
 * GET /api/tracks/metadata — every metadata field of every track of the user,
 * description, Suno prompt and lyrics included: the metadata export, and what the import compares a
 * file with (pages/tracks/import.vue).
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * 200 → TrackMetadata[]
 */
export default defineEventHandler(async (event) => {
  // The signed-in user, and a database client acting as them (RLS applies); 401 without a session.
  const { db, userId } = await requireAuth(event)
  return listTrackMetadata(db, userId)
})
