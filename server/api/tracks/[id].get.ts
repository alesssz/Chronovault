import { getTrack } from '../../services/tracks.service'

/**
 * GET /api/tracks/:id — full detail (metadata, lyrics, peaks).
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * 200 → TrackDetail; 400 invalid id; 404 missing or not the user's.
 */
export default defineEventHandler(async (event) => {
  // The signed-in user, and a database client acting as them (RLS applies); 401 without a session.
  const { db, userId } = await requireAuth(event)
  return getTrack(db, userId, requireUuidParam(event))
})
