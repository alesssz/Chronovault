import { getPlaylist } from '../../services/playlists.service'

/** GET /api/playlists/:id — the playlist with its tracks, in order. */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  return getPlaylist(db, userId, requireUuidParam(event))
})
