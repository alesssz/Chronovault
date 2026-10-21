import { deletePlaylist } from '../../services/playlists.service'

/** DELETE /api/playlists/:id — deletes the playlist (its tracks stay in the library). */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  await deletePlaylist(db, userId, requireUuidParam(event))
  setResponseStatus(event, 204)
  return null
})
