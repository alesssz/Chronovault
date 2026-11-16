import { getPlaylist } from '../../services/playlists.service'

/**
 * GET /api/playlists/:id — the playlist with its tracks, in order.
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * 200 → PlaylistDetail; 400 invalid id; 404.
 */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  return getPlaylist(db, userId, requireUuidParam(event))
})
