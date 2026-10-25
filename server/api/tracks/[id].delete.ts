import { deleteTrack } from '../../services/tracks.service'

/**
 * DELETE /api/tracks/:id — deletes the track and its files (audio on R2, cover).
 * The track also leaves every playlist (database cascade).
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * 204; 404 missing or not the user's.
 */
export default defineEventHandler(async (event) => {
  // The signed-in user, and a database client acting as them (RLS applies); 401 without a session.
  const { db, userId } = await requireAuth(event)
  await deleteTrack(db, useAudioStorage(), userId, requireUuidParam(event))
  setResponseStatus(event, 204)
  return null
})
