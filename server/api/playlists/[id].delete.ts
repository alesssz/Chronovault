import { deletePlaylist } from '../../services/playlists.service'

/**
 * DELETE /api/playlists/:id — deletes the playlist and its custom cover
 * (its tracks stay in the library).
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * 204; 404.
 */
export default defineEventHandler(async (event) => {
  // The signed-in user, and a database client acting as them (RLS applies); 401 without a session.
  const { db, userId } = await requireAuth(event)
  await deletePlaylist(db, userId, requireUuidParam(event))
  setResponseStatus(event, 204)
  return null
})
